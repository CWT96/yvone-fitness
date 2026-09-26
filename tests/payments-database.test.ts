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
  await db.close();
});
