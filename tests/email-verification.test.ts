import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  verifyEmailCode,
  resendEmailCode,
  verificationPurpose,
} from "../lib/email-verification";

test("email codes use POST verification, select the correct flow and never create accounts", async () => {
  const calls: {
    path: string;
    method: string;
    body: Record<string, unknown>;
  }[] = [];
  let response: unknown = {
    access_token: "fixture-access",
    refresh_token: "fixture-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "fixture-member", email: "member@example.test" },
  };
  let status = 200;
  const auth = createClient("https://auth.example.test", "fake-public-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
    global: {
      fetch: async (input, options) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        assert.equal(url.hostname, "auth.example.test");
        calls.push({
          path: url.pathname,
          method: options?.method || "GET",
          body: JSON.parse(String(options?.body || "{}")),
        });
        return new Response(JSON.stringify(response), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  }).auth;
  for (const [purpose, type] of [
    ["signup", "email"],
    ["recovery", "recovery"],
    ["email_change", "email_change"],
  ] as const) {
    const result = await verifyEmailCode(
      auth,
      purpose,
      " member@example.test ",
      "123 456",
    );
    assert.equal(result.complete, true);
    assert.equal(result.recovery, purpose === "recovery");
    assert.equal(calls.at(-1)!.path, "/auth/v1/verify");
    assert.equal(calls.at(-1)!.method, "POST");
    assert.equal(calls.at(-1)!.body.type, type);
    assert.equal(calls.at(-1)!.body.token, "123456");
    assert.equal(calls.at(-1)!.body.email, "member@example.test");
  }
  const before = calls.length;
  await assert.rejects(
    verifyEmailCode(auth, "signup", "member@example.test", "12a"),
    /完整数字/,
  );
  assert.equal(calls.length, before);
  response = {
    msg: "Confirmation link accepted. Please proceed to confirm link sent to the other email",
    code: "200",
  };
  assert.equal(
    (await verifyEmailCode(auth, "email_change", "new@example.test", "123456"))
      .complete,
    false,
  );
  status = 403;
  response = { code: "otp_expired", msg: "Token has expired or is invalid" };
  await assert.rejects(
    verifyEmailCode(auth, "signup", "member@example.test", "123456"),
    /expired/,
  );
  status = 200;
  response = {};
  await resendEmailCode(
    auth,
    "signup",
    "member@example.test",
    "https://www.yvonnefitness.com",
  );
  assert.equal(calls.at(-1)!.path, "/auth/v1/resend");
  assert.equal(calls.at(-1)!.body.type, "signup");
  await resendEmailCode(
    auth,
    "recovery",
    "member@example.test",
    "https://www.yvonnefitness.com",
  );
  assert.equal(calls.at(-1)!.path, "/auth/v1/recover");
  await resendEmailCode(
    auth,
    "email_change",
    "new@example.test",
    "https://www.yvonnefitness.com",
  );
  assert.equal(calls.at(-1)!.body.type, "email_change");
  assert.ok(
    calls.every(
      (c) => c.path !== "/auth/v1/signup" && c.path !== "/auth/v1/otp",
    ),
  );
  assert.equal(verificationPurpose("https://untrusted.test"), "signup");
});

test("all English auth emails contain only inert links and a displayed code", async () => {
  for (const [file, type] of [
    ["confirmation", "signup"],
    ["recovery", "recovery"],
    ["email_change", "email_change"],
  ]) {
    const html = await readFile(
      new URL(`../supabase/templates/${file}.html`, import.meta.url),
      "utf8",
    );
    assert.match(html, /\{\{ \.Token \}\}/);
    assert.doesNotMatch(html, /ConfirmationURL|TokenHash|[\u3400-\u9fff]/);
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(links, [
      `https://www.yvonnefitness.com/auth/verify?type=${type}`,
    ]);
  }
});
