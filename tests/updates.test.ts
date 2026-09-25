import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const coach = "00000000-0000-4000-8000-000000000010",
  a = "00000000-0000-4000-8000-000000000011",
  b = "00000000-0000-4000-8000-000000000012";
test("content lifecycle, private prices and contact synchronization outbox", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(f, dir), "utf8"));
  await db.exec(
    await readFile(
      new URL("202609220002_content_pricing_contacts.sql", dir),
      "utf8",
    ),
  );
  await db.exec(
    `insert into invites(code,invite_role,max_uses) values ('C','coach',1),('M','member',5)`,
  );
  for (const [id, code] of [
    [coach, "C"],
    [a, "M"],
    [b, "M"],
  ])
    await db.query<Record<string, unknown>>(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [
        id,
        id + "@example.test",
        JSON.stringify({
          full_name: id === a ? "Member A" : "Member B",
          invite_code: code,
        }),
      ],
    );
  async function as(uid: string, sql: string, args: unknown[] = []) {
    await db.exec("set role authenticated");
    try {
      await db.query<Record<string, unknown>>(
        "select set_config('request.jwt.claim.sub',$1,false)",
        [uid],
      );
      return await db.query<Record<string, unknown>>(sql, args);
    } finally {
      await db.exec(
        "reset role;select set_config('request.jwt.claim.sub','',false)",
      );
    }
  }
  let plan: string, record: string;
  await t.test(
    "drafts are private, published content reaches only its owner",
    async () => {
      plan = (
        await as(coach, "select save_plan($1,'Private plan','Draft',false)", [
          a,
        ])
      ).rows[0].save_plan as string;
      assert.equal((await as(a, "select * from plans")).rows.length, 0);
      await as(
        coach,
        "select save_plan($1,'Private plan','Published',true,$2)",
        [a, plan],
      );
      assert.equal((await as(a, "select * from plans")).rows.length, 1);
      assert.equal((await as(b, "select * from plans")).rows.length, 0);
      record = (
        await as(
          coach,
          "select save_record($1,current_date,null,null,'Private note',false)",
          [a],
        )
      ).rows[0].save_record as string;
      assert.equal((await as(a, "select * from records")).rows.length, 0);
      await as(
        coach,
        "select save_record($1,current_date,null,null,'Published note',true,$2)",
        [a, record],
      );
      assert.equal((await as(a, "select * from records")).rows.length, 1);
      assert.equal((await as(b, "select * from records")).rows.length, 0);
    },
  );
  await t.test(
    "delete hides from students; restore stays draft; members cannot delete or restore",
    async () => {
      for (const [kind, table, id] of [
        ["plan", "plans", plan],
        ["record", "records", record],
      ]) {
        await assert.rejects(
          as(a, "select set_training_deleted($1,$2,true)", [kind, id]),
          /仅教练/,
        );
        await as(coach, "select set_training_deleted($1,$2,true)", [kind, id]);
        assert.equal((await as(a, `select * from ${table}`)).rows.length, 0);
        assert.ok(
          (await as(coach, `select * from ${table} where id=$1`, [id])).rows[0]
            .deleted_at,
        );
        await assert.rejects(
          as(b, "select set_training_deleted($1,$2,false)", [kind, id]),
          /仅教练/,
        );
        await as(coach, "select set_training_deleted($1,$2,false)", [kind, id]);
        assert.equal((await as(a, `select * from ${table}`)).rows.length, 0);
      }
      await as(coach, "select set_training_deleted('plan',$1,true)", [plan]);
      await assert.rejects(
        as(coach, "select save_plan($1,'Deleted','No',true,$2)", [a, plan]),
        /已删除/,
      );
    },
  );
  await t.test(
    "personal prices never cross accounts or leak through legacy packages",
    async () => {
      await as(coach, "select save_member_prices($1,80.50,500,'USD')", [a]);
      await as(coach, "select save_member_prices($1,120,900,'USD')", [b]);
      const pa = (await as(a, "select * from member_prices")).rows;
      assert.equal(pa.length, 1);
      assert.equal(pa[0].member_id, a);
      assert.equal(Number(pa[0].monthly_price), 500);
      assert.equal(
        (await as(a, "select * from member_prices where member_id=$1", [b]))
          .rows.length,
        0,
      );
      assert.equal((await as(a, "select * from packages")).rows.length, 0);
      assert.equal(
        (await as(coach, "select * from member_prices")).rows.length,
        2,
      );
      await assert.rejects(
        as(a, "select save_member_prices($1,1,1,'USD')", [b]),
        /仅教练/,
      );
      await assert.rejects(
        as(a, "update member_prices set single_price=1"),
        /permission denied/,
      );
      await assert.rejects(
        as(coach, "select save_member_prices($1,10.001,50,'USD')", [a]),
        /两位小数/,
      );
      await assert.rejects(
        as(coach, "select save_member_prices($1,'NaN',50,'USD')", [a]),
        /金额/,
      );
      await as(coach, "select save_member_prices($1,null,0,'USD')", [a]);
      assert.equal(
        (await as(a, "select * from member_prices")).rows[0].single_price,
        null,
      );
    },
  );
  await t.test(
    "only verified members are queued and student callers cannot access or claim queue",
    async () => {
      assert.equal(
        (await db.query<Record<string, unknown>>("select * from contact_sync"))
          .rows.length,
        0,
      );
      await db.query<Record<string, unknown>>(
        "update auth.users set email_confirmed_at=now() where id=$1",
        [a],
      );
      assert.equal(
        (await db.query<Record<string, unknown>>("select * from contact_sync"))
          .rows.length,
        1,
      );
      assert.equal((await as(a, "select * from contact_sync")).rows.length, 0);
      await assert.rejects(
        as(a, "select claim_contact_sync()"),
        /permission denied/,
      );
      await assert.rejects(
        as(a, "select enqueue_contact_sync($1)", [b]),
        /permission denied/,
      );
    },
  );
  await t.test(
    "profile changes during synchronization remain pending without overlapping claims",
    async () => {
      const job = (
        await db.query<Record<string, unknown>>(
          "select * from claim_contact_sync()",
        )
      ).rows[0];
      await as(
        a,
        "select save_profile('A','', '', 'America/Los_Angeles',false)",
      );
      assert.equal(
        (
          await db.query<Record<string, unknown>>(
            "select * from claim_contact_sync()",
          )
        ).rows.length,
        0,
      );
      await db.query<Record<string, unknown>>(
        "select finish_contact_sync($1,$2,$3,null,'contact-a','old@example.test','segment',true)",
        [job.id, job.revision, job.lock_token],
      );
      const after = (
        await db.query<Record<string, unknown>>("select * from contact_sync")
      ).rows[0];
      assert.equal(after.state, "pending");
      assert.equal(after.contact_id, "contact-a");
      const next = (
        await db.query<Record<string, unknown>>(
          "select * from claim_contact_sync()",
        )
      ).rows[0];
      assert.notEqual(next.revision, job.revision);
      await db.query<Record<string, unknown>>(
        "select finish_contact_sync($1,$2,$3,null,'contact-a','new@example.test','segment',false)",
        [next.id, next.revision, next.lock_token],
      );
      assert.equal(
        (await db.query<Record<string, unknown>>("select * from contact_sync"))
          .rows[0].state,
        "synced",
      );
    },
  );
  await t.test(
    "expanded US records preserve old weights, validate measurements and retain student privacy",
    async () => {
      await as(coach, "select set_member_active($1,true)", [a]);
      const id = (
        await as(
          coach,
          "select save_record($1,current_date,62.5,24,'Old metric record',false)",
          [a],
        )
      ).rows[0].save_record;
      await db.exec(
        await readFile(
          new URL("202609250001_record_measurements.sql", dir),
          "utf8",
        ),
      );
      const save = (
        user: string,
        member: string,
        weight: number | null,
        metrics: unknown,
        publish = false,
      ) =>
        as(
          user,
          "select save_record_us($1,current_date,$2,24,'Updated record',$3,$4,$5)",
          [member, weight, publish, JSON.stringify(metrics), id],
        );
      const metrics = {
        height_in: 68,
        waist_in: 32.5,
        hips_in: 38,
        chest_in: 37,
        arm_in: 12,
        thigh_in: 22,
        resting_hr: 65,
        sleep_hours: 7.5,
      };
      await save(coach, a, 137.8, metrics);
      await save(coach, a, 137.8, metrics);
      let row = (await as(coach, "select * from records where id=$1", [id]))
        .rows[0];
      assert.equal(Number(row.weight), 62.5);
      assert.deepEqual(row.measurements, metrics);
      assert.equal(
        (await as(a, "select * from records where id=$1", [id])).rows.length,
        0,
      );
      await save(coach, a, 150, metrics, true);
      row = (await as(a, "select * from records where id=$1", [id])).rows[0];
      assert.equal(Number(row.weight), 68.0388555);
      assert.deepEqual(row.measurements, metrics);
      assert.equal(
        (await as(b, "select * from records where id=$1", [id])).rows.length,
        0,
      );
      await assert.rejects(save(a, a, 150, metrics), /仅教练/);
      await assert.rejects(save(coach, b, 150, metrics), /归属/);
      for (const invalid of [
        { unknown: 1 },
        { waist_in: -1 },
        { sleep_hours: 25 },
        { resting_hr: "bad" },
        [],
        null,
      ])
        await assert.rejects(save(coach, a, 150, invalid), /测量/);
      await save(coach, a, null, {}, true);
      row = (await as(a, "select * from records where id=$1", [id])).rows[0];
      assert.equal(row.weight, null);
      assert.deepEqual(row.measurements, {});
    },
  );
  await db.close();
});
