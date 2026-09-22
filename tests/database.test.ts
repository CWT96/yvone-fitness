import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const C = "00000000-0000-4000-8000-000000000001",
  A = "00000000-0000-4000-8000-000000000002",
  B = "00000000-0000-4000-8000-000000000003";
test("database authorization, registration, booking and delivery rules", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609200001_initial.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const emailDetailsMigration = await readFile(
    new URL(
      "../supabase/migrations/202609220001_booking_email_details.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(emailDetailsMigration);
  await db.exec(emailDetailsMigration);
  async function as<T = Record<string, unknown>>(
    uid: string,
    sql: string,
    params: unknown[] = [],
  ) {
    await db.exec("set role authenticated");
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid,
      ]);
      return await db.query<T>(sql, params);
    } finally {
      await db.exec("reset role");
      await db.exec("select set_config('request.jwt.claim.sub','',false)");
    }
  }
  async function signup(
    id: string,
    email: string,
    code: string,
    extra: Record<string, unknown> = {},
  ) {
    return db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [
        id,
        email,
        JSON.stringify({
          full_name: email.split("@")[0],
          invite_code: code,
          ...extra,
        }),
      ],
    );
  }
  await db.exec(
    "insert into public.invites(code,email,invite_role) values('COACH-TEST','coach@example.com','coach'),('MEMBER-A',null,'member'),('MEMBER-B',null,'member');",
  );
  await t.test(
    "direct signups without a valid invite are rejected",
    async () => {
      await assert.rejects(
        signup(crypto.randomUUID(), "bad@example.com", "BAD"),
        /邀请码/,
      );
      assert.equal((await db.query("select * from profiles")).rows.length, 0);
    },
  );
  await t.test("coach bootstrap invitation is bound to its email", async () => {
    await assert.rejects(
      signup(crypto.randomUUID(), "other@example.com", "COACH-TEST"),
      /邀请码/,
    );
    await signup(C, "coach@example.com", "COACH-TEST");
    assert.equal(
      (
        await db.query<{ role: string }>(
          "select role from profiles where id=$1",
          [C],
        )
      ).rows[0].role,
      "coach",
    );
  });
  await t.test("user metadata cannot assign coach role", async () => {
    await signup(A, "a@example.com", "MEMBER-A", {
      role: "coach",
      active: true,
    });
    await signup(B, "b@example.com", "MEMBER-B");
    assert.equal(
      (
        await db.query<{ role: string }>(
          "select role from profiles where id=$1",
          [A],
        )
      ).rows[0].role,
      "member",
    );
  });
  await t.test("a single-use invitation cannot be reused", async () => {
    await assert.rejects(
      signup(crypto.randomUUID(), "reuse@example.com", "MEMBER-A"),
      /邀请码/,
    );
  });
  const ref = (
    await db.query<{ referral_code: string }>(
      "select referral_code from profiles where id=$1",
      [A],
    )
  ).rows[0].referral_code;
  const R = crypto.randomUUID();
  await t.test(
    "member referral admits registration; confirmation counts only after email verification",
    async () => {
      await signup(R, "referred@example.com", ref);
      assert.equal(
        (await as<{ status: string }>(A, "select status from referrals"))
          .rows[0].status,
        "pending",
      );
      await db.query(
        "update auth.users set email_confirmed_at=now() where id=$1",
        [R],
      );
      assert.equal(
        (await as<{ status: string }>(A, "select status from referrals"))
          .rows[0].status,
        "confirmed",
      );
      assert.equal((await as(B, "select * from referrals")).rows.length, 0);
    },
  );
  await t.test("expired invitations are rejected", async () => {
    await db.exec(
      "insert into invites(code,expires_at) values('EXPIRED',now()-interval '1 day')",
    );
    await assert.rejects(
      signup(crypto.randomUUID(), "expired@example.com", "EXPIRED"),
      /邀请码/,
    );
  });
  await t.test("invalid referral rolls back invite consumption", async () => {
    await db.exec("insert into invites(code) values('ROLLBACK')");
    await assert.rejects(
      signup(crypto.randomUUID(), "rollback@example.com", "ROLLBACK", {
        referral_code: "INVALID",
      }),
      /推荐码/,
    );
    assert.equal(
      (
        await db.query<{ uses: number }>(
          "select uses from invites where code='ROLLBACK'",
        )
      ).rows[0].uses,
      0,
    );
  });
  await t.test(
    "disabling referral signup still allows separate referral attribution on a coach invitation",
    async () => {
      await as(
        C,
        "select save_settings('Yvone Fitness','America/Los_Angeles',false,'Studio')",
      );
      await assert.rejects(
        signup(crypto.randomUUID(), "disabled@example.com", ref),
        /教练/,
      );
      await signup(crypto.randomUUID(), "withinvite@example.com", "ROLLBACK", {
        referral_code: ref,
      });
      await as(
        C,
        "select save_settings('Yvone Fitness','America/Los_Angeles',true,'Studio')",
      );
    },
  );
  await t.test(
    "member only sees own profile; coach sees everyone",
    async () => {
      assert.equal((await as(A, "select * from profiles")).rows.length, 1);
      assert.ok((await as(C, "select * from profiles")).rows.length >= 4);
    },
  );
  await t.test(
    "member cannot edit role, referral code, create invites or modify settings",
    async () => {
      await assert.rejects(
        as(A, "update profiles set role='coach' where id=$1", [A]),
        /permission denied/,
      );
      await assert.rejects(as(A, "select create_invite()"), /教练/);
      await assert.rejects(
        as(A, "select save_settings('bad','UTC',true,'')"),
        /教练/,
      );
    },
  );
  const start = new Date(Date.now() + 3 * 86400000).toISOString(),
    end = new Date(Date.now() + 3 * 86400000 + 3600000).toISOString();
  let slot: string, slot2: string, booking: string;
  await t.test(
    "coach creates slots and overlapping slots are rejected",
    async () => {
      slot = (
        await as<{ save_slot: string }>(C, "select save_slot($1,$2)", [
          start,
          end,
        ])
      ).rows[0].save_slot;
      await assert.rejects(
        as(C, "select save_slot($1,$2)", [start, end]),
        /重叠/,
      );
      await assert.rejects(
        as(A, "select save_slot($1,$2)", [start, end]),
        /教练/,
      );
      slot2 = (
        await as<{ save_slot: string }>(
          C,
          "select save_slot(now()+interval '4 days',now()+interval '4 days 1 hour')",
        )
      ).rows[0].save_slot;
    },
  );
  await t.test(
    "member books an available slot and a second booking is rejected",
    async () => {
      booking = (
        await as<{ manage_booking: string }>(
          A,
          "select manage_booking('book',$1,null,null,'练习深蹲')",
          [slot],
        )
      ).rows[0].manage_booking;
      await assert.rejects(
        as(B, "select manage_booking('book',$1)", [slot]),
        /已被预约/,
      );
      assert.equal((await as(B, "select * from appointments")).rows.length, 0);
      assert.equal(
        (
          await as<{ available: boolean }>(
            B,
            "select available from get_schedule() where id=$1",
            [slot],
          )
        ).rows[0].available,
        false,
      );
    },
  );
  await t.test("booking actions cannot target other members", async () => {
    await assert.rejects(
      as(B, "select manage_booking('cancel',null,$1)", [booking]),
      /无权/,
    );
    await assert.rejects(
      as(A, "select manage_booking('book',$1,null,$2)", [slot2, B]),
      /无权/,
    );
    await assert.rejects(
      as(
        B,
        "insert into appointments(member_id,slot_id,created_by) values($1,$2,$1)",
        [B, slot2],
      ),
      /permission denied/,
    );
  });
  await t.test("booked slots cannot be closed by the coach", async () => {
    await assert.rejects(
      as(C, "select save_slot(null,null,$1)", [slot]),
      /取消或改期/,
    );
  });
  await t.test(
    "email time labels follow Pacific daylight saving time",
    async () => {
      const { rows } = await db.query<{
        winter: string;
        summer: string;
      }>(`select
      training_time_label('2026-01-10 17:00Z','2026-01-10 18:00Z','America/Los_Angeles') as winter,
      training_time_label('2026-07-10 16:00Z','2026-07-10 17:00Z','America/Los_Angeles') as summer`);
      assert.equal(rows[0].winter, "2026-01-10 09:00 – 2026-01-10 10:00");
      assert.equal(rows[0].summer, "2026-07-10 09:00 – 2026-07-10 10:00");
    },
  );
  await t.test(
    "rescheduling frees the old slot and keeps an immutable event trail",
    async () => {
      await as(A, "select manage_booking('reschedule',$1,$2,null,'工作冲突')", [
        slot2,
        booking,
      ]);
      const { rows: notices } = await db.query<{
        body: string;
        recipient_id: string;
      }>(
        "select body,recipient_id from email_jobs where appointment_id=$1 and subject='预约已改期'",
        [booking],
      );
      assert.deepEqual(
        new Set(notices.map((n) => n.recipient_id)),
        new Set([A, C]),
      );
      for (const notice of notices) {
        assert.match(notice.body, /原时间：\d{4}-\d{2}-\d{2}/);
        assert.match(notice.body, /新时间：\d{4}-\d{2}-\d{2}/);
        assert.match(notice.body, /时区：America\/Los_Angeles/);
        assert.match(notice.body, /原因：工作冲突/);
        assert.match(notice.body, /地点：Studio/);
      }
      const confirmation = (
        await db.query<{ body: string }>(
          "select body from email_jobs where appointment_id=$1 and subject='预约已确认' limit 1",
          [booking],
        )
      ).rows[0].body;
      assert.match(confirmation, /留言：练习深蹲/);
      assert.ok(
        !confirmation.includes("工作冲突"),
        "old notifications must not adopt the latest change",
      );
      assert.equal(
        (
          await as<{ available: boolean }>(
            B,
            "select available from get_schedule() where id=$1",
            [slot],
          )
        ).rows[0].available,
        true,
      );
      assert.equal(
        (
          await as(
            A,
            "select * from appointment_events where appointment_id=$1",
            [booking],
          )
        ).rows.length,
        2,
      );
      assert.equal(
        (await as(B, "select * from appointment_events")).rows.length,
        0,
      );
    },
  );
  await t.test(
    "coach can book and cancel on behalf of a member; cancellations cannot be repeated",
    async () => {
      const id = (
        await as<{ manage_booking: string }>(
          C,
          "select manage_booking('book',$1,null,$2,'代预约')",
          [slot, B],
        )
      ).rows[0].manage_booking;
      await as(C, "select manage_booking('cancel',null,$1,null,'教练请假')", [
        id,
      ]);
      const cancelled = (
        await db.query<{ body: string }>(
          "select body from email_jobs where appointment_id=$1 and subject='预约已取消' limit 1",
          [id],
        )
      ).rows[0].body;
      assert.match(cancelled, /已取消时间：\d{4}-\d{2}-\d{2}/);
      assert.match(cancelled, /原因：教练请假/);
      await assert.rejects(
        as(B, "select manage_booking('cancel',null,$1)", [id]),
        /已取消/,
      );
    },
  );
  await t.test(
    "completion is coach-only and cannot happen before class ends",
    async () => {
      await assert.rejects(
        as(A, "select manage_booking('complete',null,$1)", [booking]),
        /教练/,
      );
      await assert.rejects(
        as(C, "select manage_booking('complete',null,$1)", [booking]),
        /结束后/,
      );
    },
  );
  let plan: string;
  await t.test(
    "draft plans are coach-only and cannot cross members",
    async () => {
      plan = (
        await as<{ save_plan: string }>(
          C,
          "select save_plan($1,'A计划','深蹲',false)",
          [A],
        )
      ).rows[0].save_plan;
      assert.equal((await as(A, "select * from plans")).rows.length, 0);
      await as(C, "select save_plan($1,'A计划','深蹲',true,$2)", [A, plan]);
      assert.equal((await as(A, "select * from plans")).rows.length, 1);
      assert.equal((await as(B, "select * from plans")).rows.length, 0);
      await assert.rejects(
        as(C, "select save_plan($1,'B计划','错误归属',true,$2)", [B, plan]),
        /归属/,
      );
      await assert.rejects(
        as(A, "select save_plan($1,'bad','bad')", [A]),
        /教练/,
      );
    },
  );
  await t.test(
    "publishing another plan archives the previous current plan",
    async () => {
      await as(C, "select save_plan($1,'第二阶段','继续训练',true)", [A]);
      const plans = await as<{ status: string }>(A, "select status from plans");
      assert.equal(
        plans.rows.filter((p) => p.status === "published").length,
        1,
      );
      assert.equal(plans.rows.filter((p) => p.status === "archived").length, 1);
    },
  );
  await t.test(
    "private records stay private; shared records reach only their owner",
    async () => {
      await as(C, "select save_record($1,current_date,60,20,'私密',false)", [
        A,
      ]);
      await as(C, "select save_record($1,current_date,61,20,'共享',true)", [A]);
      assert.equal((await as(A, "select * from records")).rows.length, 1);
      assert.equal((await as(B, "select * from records")).rows.length, 0);
      await assert.rejects(
        as(A, "select save_record($1,current_date,60,20,'bad',true)", [A]),
        /教练/,
      );
    },
  );
  await t.test(
    "members may change notification preference without changing privileges",
    async () => {
      await as(
        A,
        "select save_profile('Alice','123','力量训练','America/Los_Angeles',false)",
      );
      const row = (
        await as<{ email_notifications: boolean; role: string }>(
          A,
          "select email_notifications,role from profiles",
        )
      ).rows[0];
      assert.equal(row.email_notifications, false);
      assert.equal(row.role, "member");
    },
  );
  await t.test(
    "queue and delivery worker are hidden from members; rescheduling retires old reminders",
    async () => {
      assert.equal((await as(A, "select * from email_jobs")).rows.length, 0);
      await assert.rejects(
        as(A, "select claim_email_jobs()"),
        /permission denied/,
      );
      assert.ok(
        (
          await as(
            C,
            "select * from email_jobs where kind='reminder' and state='skipped'",
          )
        ).rows.length > 0,
      );
      await db.exec("set role service_role");
      try {
        const claimed = await db.query("select * from claim_email_jobs()");
        assert.ok(claimed.rows.length > 0);
      } finally {
        await db.exec("reset role");
      }
    },
  );
  await t.test(
    "disabled members cannot read plans or book; coach cannot be disabled",
    async () => {
      await as(C, "select set_member_active($1,false)", [A]);
      assert.equal((await as(A, "select * from plans")).rows.length, 0);
      assert.equal(
        (await as(A, "select * from get_schedule()")).rows.length,
        0,
      );
      await assert.rejects(
        as(A, "select manage_booking('book',$1)", [slot]),
        /有效账号/,
      );
      await as(C, "select set_member_active($1,false)", [C]);
      assert.equal(
        (
          await as<{ active: boolean }>(
            C,
            "select active from profiles where id=$1",
            [C],
          )
        ).rows[0].active,
        true,
      );
      await as(C, "select set_member_active($1,true)", [A]);
    },
  );
  await t.test(
    "unauthenticated role cannot read data or execute booking routines",
    async () => {
      await db.exec("set role anon");
      try {
        await assert.rejects(
          db.query("select * from profiles"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select manage_booking('book',$1)", [slot]),
          /permission denied/,
        );
      } finally {
        await db.exec("reset role");
      }
    },
  );
  await db.close();
});
