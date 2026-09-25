import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { demoData } from "../lib/demo";
import {
  defaultMonthlyEnd,
  memberSessionStats,
  membershipForDate,
  validateCredit,
} from "../lib/session-accounts";
const C = "00000000-0000-4000-8000-000000000031",
  A = "00000000-0000-4000-8000-000000000032",
  B = "00000000-0000-4000-8000-000000000033";
test("session accounting: immutable journal, monthly coverage and role isolation", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const migration = await readFile(
    new URL("202609240001_session_accounts.sql", dir),
    "utf8",
  );
  for (const f of (await readdir(dir))
    .filter((f) => f.endsWith(".sql") && f < "202609240001")
    .sort())
    await db.exec(await readFile(new URL(f, dir), "utf8"));
  await db.exec(
    "insert into invites(code,invite_role,max_uses) values ('C','coach',1),('M','member',10)",
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
        JSON.stringify({ full_name: id, invite_code: code }),
      ],
    );
  async function as(uid: string, sql: string, args: unknown[] = []) {
    await db.exec("set role authenticated");
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid,
      ]);
      return await db.query<Record<string, unknown>>(sql, args);
    } finally {
      await db.exec(
        "reset role;select set_config('request.jwt.claim.sub','',false)",
      );
    }
  }
  async function booking(member: string, start: string, status = "booked") {
    const slot = randomUUID(),
      id = randomUUID();
    await db.query(
      "insert into slots(id,starts_at,ends_at) values($1,$2::timestamptz,$2::timestamptz+interval '1 hour')",
      [slot, start],
    );
    await db.query(
      "insert into appointments(id,member_id,slot_id,created_by,status) values($1,$2,$3,$4,$5)",
      [id, member, slot, C, status],
    );
    return id;
  }
  const legacy = await booking(A, "2025-01-01T18:00Z", "completed");
  await db.exec(migration);
  await db.exec(migration);
  const noShowMigration = await readFile(
    new URL("202609250002_no_show.sql", dir),
    "utf8",
  );
  await db.exec(noShowMigration);
  await db.exec(noShowMigration);
  const balance = async (member: string) =>
    Number(
      (
        await as(
          C,
          "select coalesce(sum(quantity),0) as n from session_entries where member_id=$1",
          [member],
        )
      ).rows[0].n,
    );
  const credit = async (
    id: string,
    member: string,
    qty: number,
    kind = "purchase",
  ) =>
    as(C, "select record_session_credit($1,$2,$3,$4,'测试入账',null,'USD')", [
      id,
      member,
      kind,
      qty,
    ]);
  const complete = async (id: string) =>
    as(C, "select manage_booking('complete',p_appointment=>$1)", [id]);
  await t.test(
    "migration preserves old completed lessons without backcharging",
    async () => {
      assert.equal(
        (await as(C, "select * from session_entries")).rows.length,
        0,
      );
      assert.equal(
        (await as(C, "select status from appointments where id=$1", [legacy]))
          .rows[0].status,
        "completed",
      );
    },
  );
  await t.test(
    "purchase 3 then complete 1 leaves 2; retries never double charge or credit",
    async () => {
      const request = randomUUID();
      await credit(request, A, 3);
      await credit(request, A, 3);
      assert.equal(await balance(A), 3);
      await assert.rejects(credit(request, A, 4), /已使用/);
      const id = await booking(A, "2025-01-02T18:00Z");
      await complete(id);
      assert.equal(await balance(A), 2);
      await assert.rejects(complete(id), /已取消或已完成/);
      assert.equal(await balance(A), 2);
      assert.equal(
        (
          await as(C, "select * from session_entries where appointment_id=$1", [
            id,
          ])
        ).rows.length,
        1,
      );
    },
  );
  await t.test(
    "booking, rescheduling and cancellation do not consume credits",
    async () => {
      const slots = (
        await as(
          C,
          "select save_slot(now()+interval '10 days',now()+interval '10 days 1 hour') as id",
        )
      ).rows;
      const id = (
        await as(A, "select manage_booking('book',p_slot=>$1) as id", [
          slots[0].id,
        ])
      ).rows[0].id;
      const slot2 = (
        await as(
          C,
          "select save_slot(now()+interval '11 days',now()+interval '11 days 1 hour') as id",
        )
      ).rows[0].id;
      await as(
        A,
        "select manage_booking('reschedule',p_slot=>$1,p_appointment=>$2)",
        [slot2, id],
      );
      await as(A, "select manage_booking('cancel',p_appointment=>$1)", [id]);
      assert.equal(await balance(A), 2);
      assert.equal(
        (
          await as(C, "select * from session_entries where appointment_id=$1", [
            id,
          ])
        ).rows.length,
        0,
      );
    },
  );
  let monthly: string;
  await t.test(
    "monthly date boundaries use Pacific lesson start date and preserve single-session balance",
    async () => {
      monthly = randomUUID();
      await as(
        C,
        "select record_monthly_membership($1,$2,'2025-01-31','2025-01-31','包月测试',500,'USD')",
        [monthly, A],
      );
      await as(
        C,
        "select record_monthly_membership($1,$2,'2025-01-31','2025-01-31','包月测试',500,'USD')",
        [monthly, A],
      );
      await assert.rejects(
        as(
          C,
          "select record_monthly_membership($1,$2,'2025-01-31','2025-02-01','重叠')",
          [randomUUID(), A],
        ),
        /重叠/,
      );
      for (const start of ["2025-01-31T08:00Z", "2025-02-01T06:00Z"])
        await complete(await booking(A, start));
      assert.equal(await balance(A), 2);
      assert.equal(
        (
          await as(
            A,
            "select * from session_entries where kind='monthly_lesson'",
          )
        ).rows.length,
        2,
      );
      await complete(await booking(A, "2025-02-01T08:00Z"));
      assert.equal(await balance(A), 1);
    },
  );
  await t.test(
    "voiding monthly coverage retains historical usage and stops new coverage",
    async () => {
      await as(C, "select cancel_monthly_membership($1,'录错包月')", [monthly]);
      assert.equal(
        (
          await as(
            A,
            "select * from session_entries where kind='monthly_lesson'",
          )
        ).rows.length,
        2,
      );
      await complete(await booking(A, "2025-01-31T12:00Z"));
      assert.equal(await balance(A), 0);
    },
  );
  await t.test(
    "debt is visible, adjustments retain reasons, invalid entries roll back",
    async () => {
      await complete(await booking(A, "2025-02-02T08:00Z"));
      assert.equal(await balance(A), -1);
      await credit(randomUUID(), A, 2, "adjustment");
      assert.equal(await balance(A), 1);
      for (const quantity of [0, -1, 10001])
        await assert.rejects(credit(randomUUID(), A, quantity), /有效/);
      await assert.rejects(
        as(C, "select record_session_credit($1,$2,'adjustment',1,'   ')", [
          randomUUID(),
          A,
        ]),
        /原因/,
      );
      assert.equal(await balance(A), 1);
    },
  );
  await t.test(
    "no show charges once, records notes and time in notifications, and enforces coach/end-time guards",
    async () => {
      const id = await booking(A, "2025-03-02T18:00Z");
      const before = await balance(A);
      await assert.rejects(
        as(A, "select manage_booking('no_show',p_appointment=>$1)", [id]),
        /课程已开始|仅教练/,
      );
      await assert.rejects(
        as(B, "select manage_booking('no_show',p_appointment=>$1)", [id]),
        /无权/,
      );
      const future = await booking(A, "2099-03-02T18:00Z");
      await assert.rejects(
        as(C, "select manage_booking('no_show',p_appointment=>$1)", [future]),
        /课程结束后/,
      );
      const started = await booking(
        A,
        new Date(Date.now() - 30 * 60000).toISOString(),
      );
      await assert.rejects(
        as(C, "select manage_booking('no_show',p_appointment=>$1)", [started]),
        /课程结束后/,
      );
      await as(
        C,
        "select manage_booking('no_show',p_appointment=>$1,p_message=>'临时未到')",
        [id],
      );
      assert.equal(await balance(A), before - 1);
      assert.equal(
        (await as(A, "select status from appointments where id=$1", [id]))
          .rows[0].status,
        "no_show",
      );
      const entries = (
        await as(A, "select * from session_entries where appointment_id=$1", [
          id,
        ])
      ).rows;
      assert.equal(entries.length, 1);
      assert.equal(entries[0].kind, "no_show");
      assert.equal(entries[0].quantity, -1);
      const event = (
        await as(
          A,
          "select action,message from appointment_events where appointment_id=$1",
          [id],
        )
      ).rows[0];
      assert.equal(event.action, "no_show");
      assert.equal(event.message, "临时未到");
      const emails = (
        await as(C, "select body from email_jobs where appointment_id=$1", [id])
      ).rows;
      assert.equal(emails.length, 2);
      for (const email of emails) {
        assert.match(String(email.body), /2025-03-02 10:00/);
        assert.match(String(email.body), /未到场，扣除 1 节/);
        assert.match(String(email.body), /临时未到/);
      }
      for (const action of ["no_show", "complete", "cancel", "reschedule"])
        await assert.rejects(
          as(C, "select manage_booking($1,p_appointment=>$2)", [action, id]),
          /已标记未到场/,
        );
      assert.equal(await balance(A), before - 1);
      await assert.rejects(
        as(A, "update appointments set status='no_show' where id=$1", [future]),
        /permission denied/,
      );
      await assert.rejects(
        as(C, "select record_session_credit($1,$2,'no_show',-1,'fake')", [
          randomUUID(),
          A,
        ]),
        /有效/,
      );
      const slot = (
        await as(C, "select slot_id from appointments where id=$1", [id])
      ).rows[0].slot_id;
      await assert.rejects(
        db.query(
          "insert into appointments(member_id,slot_id,created_by) values($1,$2,$3)",
          [A, slot, C],
        ),
        /one_booking_per_slot/,
      );
      assert.equal(
        (
          await as(
            B,
            "select * from appointment_events where appointment_id=$1",
            [id],
          )
        ).rows.length,
        0,
      );
    },
  );
  await t.test(
    "monthly no show uses Pacific date, consumes zero credits and preserves history on migration rerun",
    async () => {
      const membership = randomUUID();
      await as(
        C,
        "select record_monthly_membership($1,$2,'2025-03-31','2025-03-31','包月缺席测试')",
        [membership, A],
      );
      const id = await booking(A, "2025-04-01T06:00Z");
      const before = await balance(A);
      await as(C, "select manage_booking('no_show',p_appointment=>$1)", [id]);
      const entry = (
        await as(A, "select * from session_entries where appointment_id=$1", [
          id,
        ])
      ).rows[0];
      assert.equal(entry.kind, "monthly_no_show");
      assert.equal(entry.quantity, 0);
      assert.equal(entry.membership_id, membership);
      assert.equal(await balance(A), before);
      await db.exec(noShowMigration);
      assert.equal(await balance(A), before);
      assert.equal(
        (
          await as(A, "select * from session_entries where appointment_id=$1", [
            id,
          ])
        ).rows.length,
        1,
      );
      const outside = await booking(A, "2025-04-01T07:00Z");
      await as(C, "select manage_booking('no_show',p_appointment=>$1)", [
        outside,
      ]);
      assert.equal(await balance(A), before - 1);
      const emails = (
        await as(C, "select body from email_jobs where appointment_id=$1", [id])
      ).rows;
      for (const email of emails)
        assert.match(
          String(email.body),
          /包月内未到场，只记缺席，不扣按次课时/,
        );
    },
  );
  await t.test(
    "each student sees only their own journal and memberships; no direct or RPC editing",
    async () => {
      assert.equal(
        (await as(B, "select * from session_entries")).rows.length,
        0,
      );
      assert.equal(
        (await as(B, "select * from monthly_memberships")).rows.length,
        0,
      );
      assert.ok((await as(A, "select * from session_entries")).rows.length > 0);
      await assert.rejects(
        as(A, "select record_session_credit($1,$2,'purchase',3,'fake')", [
          randomUUID(),
          A,
        ]),
        /仅教练/,
      );
      await assert.rejects(
        as(
          A,
          "select record_monthly_membership($1,$2,'2025-03-01','2025-03-31','fake')",
          [randomUUID(), A],
        ),
        /仅教练/,
      );
      await assert.rejects(
        as(A, "select cancel_monthly_membership($1,'fake')", [monthly]),
        /仅教练/,
      );
      await assert.rejects(
        as(A, "update session_entries set quantity=99"),
        /permission denied/,
      );
      await assert.rejects(
        as(C, "delete from session_entries"),
        /permission denied/,
      );
      await as(C, "select set_member_active($1,false)", [A]);
      assert.equal(
        (await as(A, "select * from session_entries")).rows.length,
        0,
      );
      await db.exec("set role anon");
      await assert.rejects(
        db.query("select * from session_entries"),
        /permission denied/,
      );
      await db.exec("reset role");
    },
  );
  await db.close();
});

test("session stats separate balance, completed duration, future commitments and monthly coverage", () => {
  const data = demoData();
  const b = data.appointments.find((b) => b.id === "booking-past")!;
  b.status = "completed";
  data.session_entries.push({
    id: "debit",
    member_id: b.member_id,
    kind: "lesson",
    quantity: -1,
    note: "完成",
    amount: null,
    currency: "USD",
    appointment_id: b.id,
    membership_id: null,
    created_at: new Date().toISOString(),
  });
  const s = memberSessionStats(data, "member-1");
  assert.equal(s.balance, 2);
  assert.equal(s.purchased, 3);
  assert.equal(s.completed, 1);
  assert.equal(s.hours, 1);
  assert.equal(s.upcoming, 1);
  assert.equal(s.used, 1);
  assert.equal(s.legacyCompleted, 0);
  const m = memberSessionStats(data, "member-2");
  assert.equal(m.needsCredits, 0);
  assert.ok(m.membership);
  assert.equal(memberSessionStats(data, "member-0").balance, 3);
  assert.equal(
    membershipForDate(
      data.monthly_memberships,
      "member-1",
      data.monthly_memberships[0].starts_on,
    ),
    undefined,
  );
  assert.equal(defaultMonthlyEnd("2026-09-24"), "2026-10-23");
  assert.equal(defaultMonthlyEnd("2026-01-31"), "2026-02-27");
  assert.throws(() => validateCredit(1.5, "purchase", "test"));
  assert.throws(() => validateCredit(0, "adjustment", "test"));
});

test("no shows reduce balance without inflating completed sessions or training hours", () => {
  const data = demoData();
  const b = data.appointments.find((b) => b.id === "booking-past")!;
  b.status = "no_show";
  data.session_entries.push({
    id: "absence",
    member_id: b.member_id,
    kind: "no_show",
    quantity: -1,
    note: "未到场",
    amount: null,
    currency: "USD",
    appointment_id: b.id,
    membership_id: null,
    created_at: new Date().toISOString(),
  });
  const stats = memberSessionStats(data, b.member_id);
  assert.equal(stats.balance, 2);
  assert.equal(stats.used, 1);
  assert.equal(stats.noShows, 1);
  assert.equal(stats.completed, 0);
  assert.equal(stats.hours, 0);
  assert.equal(stats.thisMonth, 0);
  assert.equal(stats.legacyCompleted, 0);
  data.session_entries[data.session_entries.length - 1].kind =
    "monthly_no_show";
  data.session_entries[data.session_entries.length - 1].quantity = 0;
  const monthly = memberSessionStats(data, b.member_id);
  assert.equal(monthly.balance, 3);
  assert.equal(monthly.noShows, 1);
  assert.equal(monthly.monthlyUsed, 0);
});
