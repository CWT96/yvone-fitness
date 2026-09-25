import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { GET, POST, DELETE } from "../app/api/payments/route";
import { POST as webhook } from "../app/api/stripe/webhook/route";
import { APP, paymentMode } from "../lib/payments-server";
test("payment API authenticates callers, snapshots prices and verifies Stripe signatures", async (t) => {
  const names = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_MODE",
    "SITE_URL",
  ];
  const before = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://database.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service",
    STRIPE_SECRET_KEY: "rk_test_local_fixture",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    STRIPE_MODE: "test",
    SITE_URL: "https://yvonnefitness.com",
  });
  const originalFetch = globalThis.fetch;
  let role = "member",
    live = false,
    paid = false,
    dbFailure = false;
  const requests: { url: URL; body: any; headers: Headers }[] = [];
  const o = {
    id: "00000000-0000-4000-8000-000000000099",
    member_id: "member-a",
    quantity: 3,
    unit_amount: 9000,
    amount_total: 27000,
    package: "single",
    currency: "USD",
    livemode: false,
    status: "pending",
    created_at: new Date().toISOString(),
    stripe_session_id: null,
  };
  globalThis.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(options?.headers);
    let body: any = {};
    if (options?.body)
      body =
        url.hostname === "api.stripe.com"
          ? Object.fromEntries(new URLSearchParams(String(options.body)))
          : JSON.parse(String(options.body));
    requests.push({ url, body, headers });
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.hostname === "api.stripe.com")
      return json({
        id: "cs_test_fixture",
        url: "https://checkout.stripe.com/c/pay/test_fixture",
        livemode: live,
        status: paid ? "complete" : "open",
      });
    assert.equal(
      url.hostname,
      "database.example.test",
      "No external requests allowed in tests",
    );
    if (url.pathname === "/auth/v1/user")
      return json({ id: "member-a", aud: "authenticated" });
    if (url.pathname === "/rest/v1/profiles")
      return json({ id: "member-a", role, active: true });
    if (url.pathname === "/rest/v1/rpc/prepare_payment_order")
      return json({ ...o, livemode: live });
    if (url.pathname === "/rest/v1/rpc/settle_payment_order")
      return dbFailure ? json({ message: "retry" }, 500) : json("test");
    if (url.pathname === "/rest/v1/payment_orders") {
      if (options?.method === "PATCH") return json([]);
      if (url.searchParams.has("id"))
        return json({
          ...o,
          stripe_session_id: "cs_test_fixture",
          livemode: live,
        });
      return json([]);
    }
    throw new Error("Unexpected request " + url);
  };
  const req = (method = "POST", body: any = {}, token = "token") =>
    new Request("https://www.yvonnefitness.com/api/payments?page=2", {
      method,
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          }
        : {},
      body: method === "GET" ? undefined : JSON.stringify(body),
    });
  try {
    await t.test(
      "public callers rejected; members cannot use sandbox checkout",
      async () => {
        assert.equal((await GET(req("GET", {}, ""))).status, 401);
        assert.equal((await POST(req("POST", {}, ""))).status, 401);
        assert.equal((await DELETE(req("DELETE", {}, ""))).status, 401);
        assert.equal(
          (
            await POST(
              req("POST", {
                package: "single",
                quantity: 3,
                expectedUnit: 9000,
              }),
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      "checkout uses server order amounts, fixed origin, one-time mode and stable idempotency",
      async () => {
        role = "coach";
        const r = await POST(
          req("POST", {
            memberId: "member-b",
            package: "single",
            quantity: 3,
            expectedUnit: 9000,
            amount: 1,
            returnUrl: "https://evil.test",
          }),
        );
        assert.equal(r.status, 200);
        const create = requests.find(
          (r) => r.url.hostname === "api.stripe.com",
        )!;
        assert.equal(create.body.mode, "payment");
        assert.equal(
          create.body["line_items[0][price_data][unit_amount]"],
          "9000",
        );
        assert.equal(create.body["line_items[0][quantity]"], "3");
        assert.equal(create.body["metadata[app]"], APP);
        assert.ok(
          create.body.success_url.startsWith("https://www.yvonnefitness.com/"),
        );
        assert.equal(
          create.headers.get("Idempotency-Key"),
          "yvonne-checkout-" + o.id,
        );
      },
    );
    await t.test(
      "live members cannot buy for another member or list other payments",
      async () => {
        live = true;
        role = "member";
        process.env.STRIPE_MODE = "live";
        process.env.STRIPE_SECRET_KEY = "rk_live_local_fixture";
        assert.equal(
          (
            await POST(
              req("POST", {
                memberId: "victim",
                package: "single",
                quantity: 3,
                expectedUnit: 9000,
              }),
            )
          ).status,
          200,
        );
        const prepares = requests.filter((r) =>
          r.url.pathname.endsWith("prepare_payment_order"),
        );
        assert.equal(prepares.at(-1)!.body.p_member, "member-a");
        await GET(req("GET"));
        const history = requests
          .filter(
            (r) =>
              r.url.pathname === "/rest/v1/payment_orders" &&
              !r.url.searchParams.has("id"),
          )
          .at(-1)!;
        assert.equal(history.url.searchParams.get("member_id"), "eq.member-a");
        assert.equal(history.url.searchParams.get("livemode"), "eq.true");
        assert.equal(history.url.searchParams.get("offset"), "10");
        assert.equal(history.url.searchParams.get("limit"), "10");
        paid = true;
        assert.equal(
          (await DELETE(req("DELETE", { orderId: o.id }))).status,
          409,
        );
        paid = false;
        process.env.STRIPE_MODE = "test";
        process.env.STRIPE_SECRET_KEY = "rk_test_local_fixture";
        live = false;
      },
    );
    const stripe = new Stripe("sk_test_fixture");
    const event = () => ({
      id: "evt_fixture",
      object: "event",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_fixture",
          mode: "payment",
          payment_status: "paid",
          livemode: false,
          client_reference_id: o.id,
          metadata: { app: APP, order_id: o.id },
          payment_intent: "pi_fixture",
          amount_total: 27000,
          currency: "usd",
        },
      },
    });
    const signed = (e: unknown, secret = "whsec_fixture") => {
      const payload = JSON.stringify(e);
      return new Request("https://www.yvonnefitness.com/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": stripe.webhooks.generateTestHeaderString({
            payload,
            secret,
          }),
        },
        body: payload,
      });
    };
    await t.test(
      "forged callbacks fail; unpaid or other-app events cannot grant lessons",
      async () => {
        assert.equal((await webhook(signed(event(), "wrong"))).status, 400);
        const before = requests.filter((r) =>
          r.url.pathname.endsWith("settle_payment_order"),
        ).length;
        const unpaid = event();
        unpaid.data.object.payment_status = "unpaid";
        assert.equal((await webhook(signed(unpaid))).status, 200);
        const foreign = event();
        foreign.data.object.metadata.app = "another-app";
        assert.equal((await webhook(signed(foreign))).status, 200);
        const wrongMode = event();
        wrongMode.livemode = true;
        assert.equal((await webhook(signed(wrongMode))).status, 200);
        assert.equal(
          requests.filter((r) =>
            r.url.pathname.endsWith("settle_payment_order"),
          ).length,
          before,
        );
      },
    );
    await t.test(
      "verified paid event settles; database errors request webhook retry",
      async () => {
        assert.equal((await webhook(signed(event()))).status, 200);
        const settle = requests
          .filter((r) => r.url.pathname.endsWith("settle_payment_order"))
          .at(-1)!;
        assert.equal(settle.body.p_amount, 27000);
        assert.equal(settle.body.p_live, false);
        dbFailure = true;
        assert.equal((await webhook(signed(event()))).status, 500);
        dbFailure = false;
        process.env.STRIPE_MODE = "live";
        assert.equal(paymentMode(), "disabled");
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const k of names) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
});
