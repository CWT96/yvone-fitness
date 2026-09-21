import { test } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../app/api/notifications/route";

test("notification endpoint authorization and delivery behavior", async (t) => {
  const names = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "RESEND_FROM",
    "SITE_URL",
    "CRON_SECRET",
  ] as const;
  const before = Object.fromEntries(
    names.map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://database.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-key",
    RESEND_API_KEY: "fake-resend-key",
    RESEND_FROM: "test@example.test",
    SITE_URL: "https://studio.example.test",
    CRON_SECRET: "fake-cron-secret-for-local-testing-only",
  });
  const originalFetch = globalThis.fetch;
  let role = "member",
    notifications = true,
    providerStatus = 200;
  const emails: { headers: Headers; body: Record<string, unknown> }[] = [];
  let queue: Record<string, unknown>[] = [];
  const changes: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.hostname === "api.resend.com") {
      emails.push({ headers: new Headers(options?.headers), body });
      return json({ id: "fake-delivery" }, providerStatus);
    }
    assert.equal(
      url.hostname,
      "database.example.test",
      "Test must never contact any real service",
    );
    if (url.pathname === "/auth/v1/user")
      return json({
        id: "test-user",
        aud: "authenticated",
        email: "test@example.test",
      });
    if (url.pathname === "/rest/v1/settings")
      return json({ studio_name: "Yvone Fitness" });
    if (url.pathname === "/rest/v1/profiles")
      return json({
        role,
        active: true,
        email_notifications: notifications,
        email: "member@example.test",
        full_name: "Test Member",
      });
    if (url.pathname === "/rest/v1/rpc/claim_email_jobs") return json(queue);
    if (url.pathname === "/rest/v1/email_jobs") {
      if (options?.method === "PATCH") {
        changes.push(body);
        return json([]);
      }
      return json({ state: "processing" });
    }
    throw new Error("Unexpected test request: " + url.pathname);
  };
  const request = (token?: string, method = "POST") =>
    new Request("https://studio.example.test/api/notifications", {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  const job = () => ({
    id: "job-1",
    recipient_id: "test-user",
    kind: "event",
    subject: "预约更新",
    body: "课程安排有变更",
    attempts: 1,
  });
  try {
    await t.test("public callers are rejected", async () => {
      assert.equal((await GET(request(undefined, "GET"))).status, 401);
      assert.equal((await POST(request())).status, 401);
    });
    await t.test("a valid member token cannot send emails", async () => {
      role = "member";
      assert.equal((await POST(request("member-access-token"))).status, 403);
      assert.equal(emails.length, 0);
    });
    await t.test(
      "disabled notification preferences skip delivery",
      async () => {
        notifications = false;
        queue = [job()];
        const result = await POST(request(process.env.CRON_SECRET));
        assert.equal(result.status, 200);
        assert.deepEqual(await result.json(), {
          sent: 0,
          skipped: 1,
          failed: 0,
        });
        assert.equal(emails.length, 0);
        assert.ok(changes.some((c) => c.state === "skipped"));
      },
    );
    await t.test(
      "authorized delivery uses a stable idempotency key and marks success",
      async () => {
        notifications = true;
        queue = [job()];
        const result = await POST(request(process.env.CRON_SECRET));
        assert.deepEqual(await result.json(), {
          sent: 1,
          skipped: 0,
          failed: 0,
        });
        assert.equal(emails[0].headers.get("Idempotency-Key"), "yvone/job-1");
        assert.deepEqual(emails[0].body.to, ["member@example.test"]);
        assert.ok(changes.some((c) => c.state === "sent"));
      },
    );
    await t.test(
      "provider errors are retried and never reported as sent",
      async () => {
        providerStatus = 429;
        const result = await POST(request(process.env.CRON_SECRET));
        assert.deepEqual(await result.json(), {
          sent: 0,
          skipped: 0,
          failed: 1,
        });
        assert.ok(
          changes.some(
            (c) =>
              c.state === "pending" && String(c.last_error).includes("429"),
          ),
        );
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  }
});
