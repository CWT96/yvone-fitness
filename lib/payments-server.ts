import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
export const APP = "yvonne-fitness";
export function paymentMode(): "test" | "live" | "disabled" {
  const mode = process.env.STRIPE_MODE;
  const key = process.env.STRIPE_SECRET_KEY || "";
  return (mode === "test" || mode === "live") &&
    new RegExp(`^(sk|rk)_${mode}_`).test(key) &&
    process.env.STRIPE_WEBHOOK_SECRET
    ? mode
    : "disabled";
}
export function stripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || "unconfigured", {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 15000,
  });
}
export function paymentDb() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    throw new Error("支付服务尚未配置");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function paymentIdentity(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const db = paymentDb();
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);
  if (error || !user) return null;
  const { data: p } = await db
    .from("profiles")
    .select("id,role,active")
    .eq("id", user.id)
    .single();
  if (!p?.active) return null;
  return { db, profile: p };
}
export function paymentOrigin() {
  const url = new URL(process.env.SITE_URL || "https://www.yvonnefitness.com");
  if (url.protocol !== "https:") throw new Error("支付网址配置无效");
  // Always use the canonical origin so POST webhooks and return links avoid redirects.
  return url.hostname === "yvonnefitness.com"
    ? "https://www.yvonnefitness.com"
    : url.origin;
}
export async function acceptStripeEvent(event: Stripe.Event, db = paymentDb()) {
  if (event.livemode !== (paymentMode() === "live")) return;
  if (
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type)
  ) {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.metadata?.app !== APP) return;
    if (s.mode !== "payment" || s.payment_status !== "paid") return;
    if (
      s.livemode !== event.livemode ||
      !s.metadata.order_id ||
      s.client_reference_id !== s.metadata.order_id ||
      !s.payment_intent
    )
      throw new Error("Invalid payment session");
    const { error } = await db.rpc("settle_payment_order", {
      p_order: s.metadata.order_id,
      p_session: s.id,
      p_intent:
        typeof s.payment_intent === "string"
          ? s.payment_intent
          : s.payment_intent.id,
      p_amount: s.amount_total,
      p_currency: s.currency,
      p_live: s.livemode,
      p_paid_at: new Date(event.created * 1000).toISOString(),
    });
    if (error) throw new Error("Payment settlement failed");
  } else if (event.type === "checkout.session.expired") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.metadata?.app !== APP || !s.metadata.order_id) return;
    const { error } = await db
      .from("payment_orders")
      .update({ status: "expired" })
      .eq("id", s.metadata.order_id)
      .eq("stripe_session_id", s.id)
      .eq("livemode", event.livemode)
      .eq("status", "pending");
    if (error) throw new Error("Payment expiry failed");
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    if (
      charge.metadata?.app !== APP ||
      !charge.metadata.order_id ||
      !charge.payment_intent
    )
      return;
    const { error } = await db.rpc("note_payment_refund", {
      p_order: charge.metadata.order_id,
      p_intent:
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent.id,
      p_amount: charge.amount_refunded,
      p_live: event.livemode,
    });
    if (error) throw new Error("Refund recording failed");
  }
}
