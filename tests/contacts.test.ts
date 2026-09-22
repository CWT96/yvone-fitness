import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { syncContacts } from "../lib/contact-sync";
import { POST } from "../app/api/contacts/route";

test("contact sync is scoped, retryable and never resets shared subscriptions", async (t) => {
  const names = [
    "RESEND_CONTACTS_API_KEY",
    "RESEND_SEGMENT_ID",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const;
  const before = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  Object.assign(process.env, {
    RESEND_CONTACTS_API_KEY: "fake-contacts-key",
    RESEND_SEGMENT_ID: "fitness-segment",
    NEXT_PUBLIC_SUPABASE_URL: "https://db.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "fake-server-key",
  });
  const original = globalThis.fetch;
  const job = {
    id: "job",
    member_id: "member",
    revision: 1,
    lock_token: "lock",
    attempts: 1,
    contact_id: null as string | null,
    synced_email: null as string | null,
    segment_id: null as string | null,
  };
  let role = "member",
    enabled = true,
    existing = true,
    failSegment = false;
  const requests: {
      path: string;
      method: string;
      body: Record<string, unknown>;
    }[] = [],
    finishes: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : String(input)),
      method = options?.method || "GET",
      body = options?.body ? JSON.parse(String(options.body)) : {};
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.hostname === "db.example.test") {
      if (url.pathname === "/auth/v1/user")
        return json({ id: "member", aud: "authenticated" });
      if (url.pathname === "/rest/v1/profiles")
        return json({
          email: "member+test@example.test",
          full_name: "Member",
          role,
          active: true,
          email_notifications: enabled,
        });
      if (url.pathname === "/rest/v1/contact_sync")
        return json(method === "PATCH" ? [] : { revision: 1 });
      if (url.pathname === "/rest/v1/rpc/claim_contact_sync")
        return json([job]);
      if (url.pathname === "/rest/v1/rpc/finish_contact_sync") {
        finishes.push(body);
        return json(null);
      }
      throw Error("Unexpected database call " + url.pathname);
    }
    assert.equal(
      url.hostname,
      "api.resend.com",
      "No real network calls allowed",
    );
    requests.push({ path: url.pathname, method, body });
    if (url.pathname === "/segments/fitness-segment")
      return json({ id: "fitness-segment" }, failSegment ? 403 : 200);
    if (url.pathname === "/contacts/member%2Btest%40example.test")
      return existing
        ? json({ id: "shared-contact", unsubscribed: true })
        : json({ message: "not found" }, 404);
    if (url.pathname === "/contacts" && method === "POST")
      return json({ id: "new-contact" });
    if (url.pathname.includes("/segments/")) return json({ id: "membership" });
    throw Error("Unexpected Resend call " + url.pathname);
  };
  const db = createClient("https://db.example.test", "fake-server-key", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    await t.test(
      "public and member callers cannot run contact sync",
      async () => {
        assert.equal(
          (
            await POST(
              new Request("https://website.example/api/contacts", {
                method: "POST",
              }),
            )
          ).status,
          401,
        );
        assert.equal(
          (
            await POST(
              new Request("https://website.example/api/contacts", {
                method: "POST",
                headers: { Authorization: "Bearer member-token" },
              }),
            )
          ).status,
          403,
        );
        assert.equal(requests.length, 0);
      },
    );
    await t.test(
      "existing contact joins only selected segment and preserves global opt-out",
      async () => {
        role = "member";
        requests.length = 0;
        finishes.length = 0;
        assert.deepEqual(await syncContacts(db), {
          synced: 1,
          failed: 0,
          configured: true,
        });
        assert.ok(
          requests.some(
            (r) =>
              r.path === "/contacts/shared-contact/segments/fitness-segment" &&
              r.method === "POST",
          ),
        );
        assert.ok(requests.every((r) => r.method !== "PATCH"));
        assert.equal(finishes[0].p_contact, "shared-contact");
      },
    );
    await t.test(
      "opt-out removes only fitness membership and never deletes shared contact",
      async () => {
        enabled = false;
        requests.length = 0;
        await syncContacts(db);
        assert.deepEqual(
          requests.filter((r) => r.method === "DELETE").map((r) => r.path),
          ["/contacts/shared-contact/segments/fitness-segment"],
        );
        assert.ok(requests.every((r) => r.method !== "PATCH"));
      },
    );
    await t.test(
      "new contact is created once and added to supplied segment",
      async () => {
        enabled = true;
        existing = false;
        requests.length = 0;
        await syncContacts(db);
        const created = requests.find(
          (r) => r.path === "/contacts" && r.method === "POST",
        );
        assert.equal(created?.body.email, "member+test@example.test");
        assert.ok(
          requests.some(
            (r) => r.path === "/contacts/new-contact/segments/fitness-segment",
          ),
        );
      },
    );
    await t.test(
      "wrong permissions produce a retry status without changing contacts",
      async () => {
        failSegment = true;
        requests.length = 0;
        finishes.length = 0;
        assert.deepEqual(await syncContacts(db), {
          synced: 0,
          failed: 1,
          configured: true,
        });
        assert.equal(requests.length, 1);
        assert.match(String(finishes[0].p_error), /403/);
      },
    );
  } finally {
    globalThis.fetch = original;
    for (const name of names) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  }
});
