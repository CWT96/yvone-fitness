import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
const C = "00000000-0000-4000-8000-000000000051",
  A = "00000000-0000-4000-8000-000000000052",
  B = "00000000-0000-4000-8000-000000000053";
test("one-time payments: private quotes, idempotent fulfillment, sandbox isolation and refunds", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(f, dir), "utf8"));
  await db.exec(
    "insert into invites(code,invite_role,max_uses) values('C','coach',1),('M','member',10)",
  );
  for (const [id, code] of [
    [C, "C"],
    [A, "M"],
    [B, "M"],
  ])
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [
        id,
        id + "@example.test",
        JSON.stringify({ full_name: "Test", invite_code: code }),
      ],
    );
  await db.query(
    "insert into member_prices(member_id,single_price,monthly_price,currency) values($1,90,600,'USD'),($2,100,700,'USD')",
    [A, B],
  );
  async function as(
    role: string,
    uid: string,
    sql: string,
    args: unknown[] = [],
  ) {
    await db.exec(`set role ${role}`);
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid,
      ]);
      return await db.query<any>(sql, args);
    } finally {
      await db.exec(
        "reset role;select set_config('request.jwt.claim.sub','',false)",
      );
    }
  }
  const service = (sql: string, args: unknown[] = []) =>
    as("service_role", "", sql, args);
  const prepare = async (
    member = A,
    actor = A,
    kind = "single",
    qty = 3,
    expected = 9000,
    live = true,
  ) =>
    (
      await service("select * from prepare_payment_order($1,$2,$3,$4,$5,$6)", [
        member,
        actor,
        kind,
        qty,
        expected,
        live,
      ])
    ).rows[0];
  const settle = (
    o: any,
    session = "cs_" + o.id,
    intent = "pi_" + o.id,
    amount = o.amount_total,
    live = o.livemode,
    date = "2026-01-31T20:00:00Z",
  ) =>
    service("select settle_payment_order($1,$2,$3,$4,$5,$6,$7)", [
      o.id,
      session,
      intent,
      amount,
      o.currency,
      live,
      date,
    ]);
  let order: any;
  await t.test(
    "referral signup name remains private and stable; direct scheduling is atomic and coach-only",
    async () => {
      const D = "00000000-0000-4000-8000-000000000054";
      const code = (
        await db.query<{ referral_code: string }>(
          "select referral_code from profiles where id=$1",
          [A],
        )
      ).rows[0].referral_code;
      await db.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,'signup@example.test',$2)",
        [
          D,
          JSON.stringify({
            full_name: "Original signup name",
            invite_code: code,
          }),
        ],
      );
      await db.query(
        "update profiles set full_name='Changed name' where id=$1",
        [D],
      );
      assert.equal(
        (
          await as(
            "authenticated",
            A,
            "select referred_name from referrals where referred_id=$1",
            [D],
          )
        ).rows[0].referred_name,
        "Original signup name",
      );
      assert.equal(
        (
          await as(
            "authenticated",
            B,
            "select * from referrals where referred_id=$1",
            [D],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await as("authenticated", A, "select * from profiles where id=$1", [
            D,
          ])
        ).rows.length,
        0,
      );
      const sql =
        "select book_new_slot($1,now()+interval '10 days',now()+interval '10 days 1 hour','Test booking') as id";
      await assert.rejects(as("authenticated", A, sql, [A]), /仅教练/);
      await db.query("update profiles set active=false where id=$1", [B]);
      const count = async () =>
        Number(
          (await db.query<{ n: string }>("select count(*) as n from slots"))
            .rows[0].n,
        );
      const before = await count();
      await assert.rejects(as("authenticated", C, sql, [B]));
      assert.equal(await count(), before);
      await db.query("update profiles set active=true where id=$1", [B]);
      const created = (await as("authenticated", C, sql, [A])).rows[0].id;
      assert.ok(created);
      assert.equal(await count(), before + 1);
      await assert.rejects(as("authenticated", C, sql, [B]), /重叠/);
      assert.equal(await count(), before + 1);
    },
  );
  await t.test(
    "snapshots server price, rejects stale prices, foreign purchasers and direct member RPCs",
    async () => {
      order = await prepare();
      assert.equal(order.amount_total, 27000);
      assert.equal((await prepare()).id, order.id);
      await assert.rejects(prepare(A, B), /无权/);
      await assert.rejects(prepare(A, A, "single", 1, 1), /价格已更新/);
      await assert.rejects(prepare(A, A, "monthly", 2, 60000), /无效/);
      await assert.rejects(prepare(A, A, "single", 3, 9000, false), /仅教练/);
      await assert.rejects(
        as(
          "authenticated",
          A,
          "select * from prepare_payment_order($1,$1,'single',3,9000,true)",
          [A],
        ),
        /permission denied/,
      );
      await assert.rejects(
        as("authenticated", A, "update payment_orders set status='paid'"),
        /permission denied/,
      );
      assert.equal(
        (await as("authenticated", B, "select * from payment_orders")).rows
          .length,
        0,
      );
      assert.equal(
        (await as("authenticated", A, "select * from payment_orders")).rows
          .length,
        1,
      );
    },
  );
  await t.test(
    "paid amount/mode must match; duplicate events credit exactly once even after price changes",
    async () => {
      await assert.rejects(settle(order, undefined, undefined, 1), /不匹配/);
      await assert.rejects(
        settle(order, undefined, undefined, order.amount_total, false),
        /不匹配/,
      );
      await db.query(
        "update member_prices set single_price=95 where member_id=$1",
        [A],
      );
      await settle(order);
      await settle(order);
      const rows = (await service("select * from session_entries")).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].quantity, 3);
      assert.equal(Number(rows[0].amount), 270);
      assert.equal(
        (
          await service(
            "select * from email_jobs where subject='购课付款已确认'",
          )
        ).rows.length,
        2,
      );
      await assert.rejects(settle(order, "cs_wrong"), /不匹配/);
    },
  );
  await t.test(
    "sandbox records payment but creates no balance, membership or notification",
    async () => {
      const o = await prepare(B, C, "monthly", 1, 70000, false);
      await settle(o);
      await settle(o);
      assert.equal(
        (await service("select * from monthly_memberships")).rows.length,
        0,
      );
      assert.equal(
        (await service("select * from session_entries")).rows.length,
        1,
      );
      assert.equal(
        (await as("authenticated", B, "select * from payment_orders")).rows
          .length,
        0,
      );
      assert.equal(
        (
          await service("select fulfillment from payment_orders where id=$1", [
            o.id,
          ])
        ).rows[0].fulfillment,
        "test",
      );
    },
  );
  await t.test(
    "single month uses Pacific paid date and end-of-month clamp, with no renewal",
    async () => {
      const o = await prepare(A, A, "monthly", 1, 60000);
      await settle(
        o,
        undefined,
        undefined,
        o.amount_total,
        true,
        "2026-02-01T06:00:00Z",
      );
      const m = (
        await service(
          "select starts_on::text,ends_on::text from monthly_memberships where id=$1",
          [o.id],
        )
      ).rows[0];
      assert.equal(m.starts_on, "2026-01-31");
      assert.equal(m.ends_on, "2026-02-27");
      await settle(o);
      assert.equal(
        (await service("select * from monthly_memberships")).rows.length,
        1,
      );
      // Active monthly membership prevents another purchase.
      await db.query(
        "update monthly_memberships set starts_on=current_date-1,ends_on=current_date+20 where id=$1",
        [o.id],
      );
      await assert.rejects(prepare(A, A, "monthly", 1, 60000), /到期后/);
    },
  );
  await t.test(
    "manual coverage added during checkout results in paid-review, never overlapping grants",
    async () => {
      const o = await prepare(B, B, "monthly", 1, 70000);
      await db.query(
        "insert into monthly_memberships(id,member_id,starts_on,ends_on,note,created_by) values($1,$2,'2026-01-01','2026-02-28','manual',$3)",
        [randomUUID(), B, C],
      );
      await settle(o);
      const r = (
        await service(
          "select status,fulfillment from payment_orders where id=$1",
          [o.id],
        )
      ).rows[0];
      assert.equal(r.status, "paid");
      assert.equal(r.fulfillment, "review");
      assert.equal(
        (
          await service(
            "select * from monthly_memberships where member_id=$1",
            [B],
          )
        ).rows.length,
        1,
      );
    },
  );
  await t.test(
    "refunds record cumulative amounts once, flag entitlement review and preserve history",
    async () => {
      const refund = (amount: number) =>
        service("select note_payment_refund($1,$2,$3,true)", [
          order.id,
          "pi_" + order.id,
          amount,
        ]);
      await refund(9000);
      await refund(9000);
      await refund(27000);
      await refund(9000);
      const r = (
        await service(
          "select status,amount_refunded,fulfillment from payment_orders where id=$1",
          [order.id],
        )
      ).rows[0];
      assert.equal(r.status, "refunded");
      assert.equal(r.amount_refunded, 27000);
      assert.equal(r.fulfillment, "review");
      await settle(order);
      assert.equal(
        (
          await service("select quantity from session_entries where id=$1", [
            order.id,
          ])
        ).rows[0].quantity,
        3,
      );
      await assert.rejects(refund(30000), /不匹配/);
      await db.exec("set role anon");
      await assert.rejects(
        db.query("select * from payment_orders"),
        /permission denied/,
      );
      await db.exec("reset role");
    },
  );
  await t.test(
    "coach can shift into a new overlapping time; conflicts roll back the entire change",
    async () => {
      const a = (
        await db.query<any>(
          "select id,slot_id from appointments where message='Test booking' and member_id=$1",
          [A],
        )
      ).rows[0];
      await assert.rejects(
        as(
          "authenticated",
          A,
          "select reschedule_new_slot($1,now()+interval '10 days 30 minutes',now()+interval '10 days 90 minutes','shift')",
          [a.id],
        ),
        /仅教练/,
      );
      await as(
        "authenticated",
        C,
        "select reschedule_new_slot($1,now()+interval '10 days 30 minutes',now()+interval '10 days 90 minutes','shift')",
        [a.id],
      );
      const changed = (
        await db.query<any>(
          "select slot_id,reason from appointments where id=$1",
          [a.id],
        )
      ).rows[0];
      assert.notEqual(changed.slot_id, a.slot_id);
      assert.equal(changed.reason, "shift");
      assert.equal(
        (
          await db.query<any>("select active from slots where id=$1", [
            a.slot_id,
          ])
        ).rows[0].active,
        false,
      );
      await as(
        "authenticated",
        C,
        "select save_slot(now()+interval '10 days 100 minutes',now()+interval '10 days 160 minutes')",
      );
      const count = (await db.query<any>("select count(*) n from slots"))
        .rows[0].n;
      await assert.rejects(
        as(
          "authenticated",
          C,
          "select reschedule_new_slot($1,now()+interval '10 days 80 minutes',now()+interval '10 days 140 minutes','conflict')",
          [a.id],
        ),
        /重叠/,
      );
      assert.equal(
        (
          await db.query<any>("select active from slots where id=$1", [
            changed.slot_id,
          ])
        ).rows[0].active,
        true,
      );
      assert.equal(
        (
          await db.query<any>("select slot_id from appointments where id=$1", [
            a.id,
          ])
        ).rows[0].slot_id,
        changed.slot_id,
      );
      assert.equal(
        (await db.query<any>("select count(*) n from slots")).rows[0].n,
        count,
      );
    },
  );
  await t.test(
    "3 and 12 month packages use private total prices and calendar expiry with idempotent settlement",
    async () => {
      const D = "00000000-0000-4000-8000-000000000054";
      await assert.rejects(
        as(
          "authenticated",
          D,
          "select save_member_package_prices($1,90,600,1500,5000,'USD')",
          [D],
        ),
        /仅教练/,
      );
      await as(
        "authenticated",
        C,
        "select save_member_package_prices($1,90,600,1500,5000,'USD')",
        [D],
      );
      assert.equal(
        (
          await as(
            "authenticated",
            B,
            "select * from member_prices where member_id=$1",
            [D],
          )
        ).rows.length,
        0,
      );
      for (const [kind, amount, paid, start, end] of [
        [
          "quarterly",
          150000,
          "2030-01-31T20:00:00Z",
          "2030-01-31",
          "2030-04-29",
        ],
        ["annual", 500000, "2032-02-29T20:00:00Z", "2032-02-29", "2033-02-27"],
      ] as const) {
        await assert.rejects(prepare(D, D, kind, 2, amount), /无效/);
        const o = await prepare(D, D, kind, 1, amount);
        assert.equal(o.amount_total, amount);
        await settle(o, undefined, undefined, amount, true, paid);
        await settle(o, undefined, undefined, amount, true, paid);
        const rows = (
          await db.query<any>(
            "select starts_on::text,ends_on::text from monthly_memberships where id=$1",
            [o.id],
          )
        ).rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].starts_on, start);
        assert.equal(rows[0].ends_on, end);
      }
    },
  );
  await t.test(
    "catalog prices stay private, fixed packages grant exact credits and online coaching is independent",
    async () => {
      const D = "00000000-0000-4000-8000-000000000055";
      await db.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,'catalog@example.test',$2)",
        [D, JSON.stringify({ full_name: "Catalog", invite_code: "M" })],
      );
      const prices = JSON.stringify({
        single: 101,
        monthly: 901,
        starter: 401,
        standard: 801,
        premium: 1501,
        online_monthly: 201,
        online_quarterly: 501,
        online_annual: 1001,
      });
      const save = "select save_member_catalog_prices($1,$2::jsonb,'USD')";
      await assert.rejects(as("authenticated", D, save, [D, prices]), /仅教练/);
      await as("authenticated", C, save, [D, prices]);
      await assert.rejects(
        as("authenticated", C, save, [D, JSON.stringify({ starter: -1 })]),
        /价格无效/,
      );
      assert.equal(
        (
          await as(
            "authenticated",
            A,
            "select * from member_prices where member_id=$1",
            [D],
          )
        ).rows.length,
        0,
      );
      for (const [kind, qty, amount] of [
        ["starter", 5, 40100],
        ["standard", 10, 80100],
        ["premium", 20, 150100],
      ] as const) {
        await assert.rejects(prepare(D, D, kind, 2, amount), /无效/);
        await assert.rejects(prepare(D, D, kind, 1, 1), /价格已更新/);
        const o = await prepare(D, D, kind, 1, amount);
        await settle(
          o,
          undefined,
          undefined,
          amount,
          true,
          "2026-01-31T20:00:00Z",
        );
        await settle(
          o,
          undefined,
          undefined,
          amount,
          true,
          "2026-01-31T20:00:00Z",
        );
        const rows = (
          await service(
            "select quantity,expires_on::text from session_entries where id=$1",
            [o.id],
          )
        ).rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].quantity, qty);
        assert.equal(rows[0].expires_on, "2026-04-29");
      }
      const before = (
        await service("select * from session_entries where member_id=$1", [D])
      ).rows.length;
      for (const [kind, amount, paid, end] of [
        ["online_monthly", 20100, "2020-01-31T20:00:00Z", "2020-02-28"],
        ["online_quarterly", 50100, "2020-05-31T20:00:00Z", "2020-08-30"],
        ["online_annual", 100100, "2021-02-28T20:00:00Z", "2022-02-27"],
      ] as const) {
        const o = await prepare(D, D, kind, 1, amount);
        await settle(o, undefined, undefined, amount, true, paid);
        await settle(o, undefined, undefined, amount, true, paid);
        const rows = (
          await service(
            "select ends_on::text from online_memberships where id=$1",
            [o.id],
          )
        ).rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].ends_on, end);
      }
      assert.equal(
        (await service("select * from session_entries where member_id=$1", [D]))
          .rows.length,
        before,
      );
      assert.equal(
        (
          await service(
            "select * from monthly_memberships where member_id=$1",
            [D],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await as(
            "authenticated",
            A,
            "select * from online_memberships where member_id=$1",
            [D],
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        as(
          "authenticated",
          D,
          "update online_memberships set ends_on='2099-01-01'",
        ),
        /permission denied/,
      );
      const sandbox = await prepare(D, C, "online_monthly", 1, 20100, false);
      await settle(sandbox);
      assert.equal(
        (
          await service("select * from online_memberships where id=$1", [
            sandbox.id,
          ])
        ).rows.length,
        0,
      );
      const active = randomUUID();
      await as(
        "authenticated",
        C,
        "select record_online_membership($1,$2,current_date,current_date+30,'manual',null,'USD')",
        [active, D],
      );
      await assert.rejects(prepare(D, D, "online_annual", 1, 100100), /到期后/);
      // Online membership never exempts an in-person lesson from its normal deduction.
      const slot = randomUUID(),
        lesson = randomUUID();
      await db.query(
        "insert into slots(id,starts_at,ends_at) values($1,now()-interval '3 hours',now()-interval '2 hours')",
        [slot],
      );
      await db.query(
        "insert into appointments(id,member_id,slot_id,created_by,status) values($1,$2,$3,$4,'booked')",
        [lesson, D, slot, C],
      );
      await db.query("update appointments set status='completed' where id=$1", [
        lesson,
      ]);
      const charged = (
        await service(
          "select kind,quantity,membership_id from session_entries where appointment_id=$1",
          [lesson],
        )
      ).rows[0];
      assert.equal(charged.kind, "lesson");
      assert.equal(charged.quantity, -1);
      assert.equal(charged.membership_id, null);
      await assert.rejects(
        as("authenticated", D, "select cancel_online_membership($1,'reason')", [
          active,
        ]),
        /仅教练/,
      );
      await as(
        "authenticated",
        C,
        "select cancel_online_membership($1,'recorded incorrectly')",
        [active],
      );
      const overlap = await prepare(D, D, "online_monthly", 1, 20100);
      await as(
        "authenticated",
        C,
        "select record_online_membership($1,$2,current_date,current_date+30,'second manual',null,'USD')",
        [randomUUID(), D],
      );
      await settle(
        overlap,
        undefined,
        undefined,
        20100,
        true,
        new Date().toISOString(),
      );
      assert.equal(
        (
          await service("select fulfillment from payment_orders where id=$1", [
            overlap.id,
          ])
        ).rows[0].fulfillment,
        "review",
      );
      const manual = randomUUID();
      const record =
        "select record_session_credit_with_expiry($1,$2,'purchase',5,'manual package',null,'USD','2027-01-01')";
      await assert.rejects(
        as("authenticated", D, record, [manual, D]),
        /仅教练/,
      );
      await as("authenticated", C, record, [manual, D]);
      await as("authenticated", C, record, [manual, D]);
      await assert.rejects(
        as("authenticated", C, record.replace("2027-01-01", "2027-02-01"), [
          manual,
          D,
        ]),
        /已使用/,
      );
      assert.equal(
        (await service("select * from session_entries where id=$1", [manual]))
          .rows.length,
        1,
      );
    },
  );
  await db.close();
});
