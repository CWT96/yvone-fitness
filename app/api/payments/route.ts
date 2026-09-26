import { translate } from "@/lib/i18n";
import { packageOptions, type PackageKind } from "@/lib/package-options";
import {
  APP,
  paymentIdentity,
  paymentMode,
  paymentOrigin,
  stripeClient,
} from "@/lib/payments-server";
export const runtime = "nodejs";
export const maxDuration = 60;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  try {
    const identity = await paymentIdentity(request);
    if (!identity) return json({ error: "请先登录有效账号" }, 401);
    const { db, profile } = identity;
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(100000, Number(params.get("page")) || 1));
    if (!Number.isInteger(page)) return json({ error: "页码无效" }, 400);
    let q = db
      .from("payment_orders")
      .select(
        "id,member_id,package,quantity,amount_total,currency,livemode,status,created_at,paid_at,starts_on,ends_on,fulfillment,review_note,amount_refunded",
        { count: "exact" },
      );
    if (profile.role !== "coach")
      q = q.eq("member_id", profile.id).eq("livemode", true);
    else if (params.get("member")) q = q.eq("member_id", params.get("member")!);
    const { data, error, count } = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * 10, page * 10 - 1);
    if (error) return json({ error: "付款记录暂不可用" }, 503);
    return json({ mode: paymentMode(), orders: data, total: count, page });
  } catch {
    return json({ error: "付款服务暂不可用" }, 503);
  }
}
export async function POST(request: Request) {
  try {
    const identity = await paymentIdentity(request);
    if (!identity) return json({ error: "请先登录有效账号" }, 401);
    const { db, profile } = identity;
    const mode = paymentMode();
    if (mode === "disabled") return json({ error: "在线付款尚未开放" }, 503);
    if (mode === "test" && profile.role !== "coach")
      return json({ error: "付款正在测试，暂未对学员开放" }, 403);
    const b = await request.json();
    let order;
    if (b.orderId) {
      let q = db
        .from("payment_orders")
        .select("*")
        .eq("id", b.orderId)
        .eq("livemode", mode === "live");
      if (profile.role !== "coach") q = q.eq("member_id", profile.id);
      const result = await q.single();
      if (result.error || !result.data)
        return json({ error: "找不到订单" }, 404);
      order = result.data;
      if (order.status !== "pending")
        return json({ error: "此订单已结束，请刷新记录" }, 409);
    } else {
      const member = profile.role === "coach" ? b.memberId : profile.id;
      if (
        !member ||
        !Object.hasOwn(packageOptions, b.package) ||
        !Number.isInteger(b.quantity) ||
        !Number.isInteger(b.expectedUnit)
      )
        return json({ error: "购课选项无效" }, 400);
      if (profile.role === "coach" && mode === "live")
        return json({ error: "正式付款请由学员登录自己的账号完成" }, 403);
      const { data, error } = await db.rpc("prepare_payment_order", {
        p_member: member,
        p_actor: profile.id,
        p_package: b.package,
        p_quantity: b.quantity,
        p_expected: b.expectedUnit,
        p_live: mode === "live",
      });
      if (error)
        return json(
          {
            error:
              error.code === "P0001"
                ? error.message
                : "订单创建失败，请稍后重试",
          },
          409,
        );
      order = data;
    }
    if (profile.role === "coach" && mode === "live")
      return json({ error: "正式付款请由学员登录自己的账号完成" }, 403);
    const stripe = stripeClient();
    if (order.stripe_session_id) {
      const s = await stripe.checkout.sessions.retrieve(
        order.stripe_session_id,
      );
      if (s.status !== "open" || !s.url)
        return json(
          { error: "此付款页面已结束，请刷新付款记录；已付款订单请勿重复购买" },
          409,
        );
      return json({ url: s.url });
    }
    const origin = paymentOrigin();
    const language = profile.language === "en" ? "en" : "zh";
    const s = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        locale: language === "en" ? "en" : "zh",
        payment_method_types: ["card"],
        client_reference_id: order.id,
        metadata: { app: APP, order_id: order.id },
        payment_intent_data: { metadata: { app: APP, order_id: order.id } },
        line_items: [
          {
            quantity: order.quantity,
            price_data: {
              currency: order.currency.toLowerCase(),
              unit_amount: order.unit_amount,
              product_data: {
                name: `Yvonne Fitness · ${translate(packageOptions[order.package as PackageKind].label, language)}`,
              },
            },
          },
        ],
        custom_text: {
          submit: {
            message:
              packageOptions[order.package as PackageKind].category === "online"
                ? language === "en"
                  ? `Online coaching for ${packageOptions[order.package as PackageKind].months} month(s), starting on payment. No in-person sessions; no automatic renewal.`
                  : `线上指导 ${packageOptions[order.package as PackageKind].months} 个月，自付款当日起计算；不含线下课程，不自动续费。`
                : ["starter", "standard", "premium"].includes(order.package)
                  ? language === "en"
                    ? `${packageOptions[order.package as PackageKind].sessions} in-person sessions, valid for 3 months from payment. Unused sessions expire.`
                    : `${packageOptions[order.package as PackageKind].sessions} 节线下课，自付款日起 3 个月内使用，过期未使用课时作废。`
                  : order.package !== "single"
                    ? language === "en"
                      ? `Unlimited in-person training for ${packageOptions[order.package as PackageKind].months} month(s), starting on payment. No automatic renewal.`
                      : `线下不限次 ${packageOptions[order.package as PackageKind].months} 个月，自付款当日起计算，不自动续费。`
                    : language === "en"
                      ? "One-hour in-person sessions. Credits are added after payment; book your sessions separately."
                      : "每节 1 小时线下私教，付款后增加课时，训练时间另行预约。",
          },
        },
        expires_at: Math.floor(Date.parse(order.created_at) / 1000) + 3600,
        success_url: `${origin}/?payment=success&order=${order.id}`,
        cancel_url: `${origin}/?payment=cancel&order=${order.id}`,
      },
      { idempotencyKey: `yvonne-checkout-${order.id}` },
    );
    if (s.livemode !== order.livemode || !s.url)
      throw new Error("Stripe mode mismatch");
    const { error } = await db
      .from("payment_orders")
      .update({ stripe_session_id: s.id })
      .eq("id", order.id)
      .is("stripe_session_id", null);
    if (error) throw new Error("Could not link checkout");
    return json({ url: s.url });
  } catch {
    return json(
      { error: "付款页面暂时无法打开，请稍后重试；已付款请勿再次购买" },
      502,
    );
  }
}
export async function DELETE(request: Request) {
  try {
    const identity = await paymentIdentity(request);
    if (!identity) return json({ error: "请先登录" }, 401);
    const { db, profile } = identity;
    const { orderId } = await request.json();
    let q = db.from("payment_orders").select("*").eq("id", orderId);
    if (profile.role !== "coach")
      q = q.eq("member_id", profile.id).eq("livemode", true);
    const { data: o, error } = await q.single();
    if (error || !o) return json({ error: "找不到订单" }, 404);
    if (o.status !== "pending")
      return json({ error: "订单已结束，请刷新记录" }, 409);
    if (
      paymentMode() === "disabled" ||
      o.livemode !== (paymentMode() === "live")
    )
      return json({ error: "当前环境不能关闭此订单" }, 409);
    // Always obtain the idempotent session first, even if its initial response was lost.
    // Orders without a linked session are left to expire, avoiding a create/cancel race.
    if (!o.stripe_session_id)
      return json(
        { error: "付款页面仍在准备，请稍后重试；未付款订单会自动过期" },
        409,
      );
    const stripe = stripeClient();
    const s = await stripe.checkout.sessions.retrieve(o.stripe_session_id);
    if (s.status === "complete")
      return json({ error: "订单已付款，正在确认入账，请勿重复购买" }, 409);
    if (s.status === "open") await stripe.checkout.sessions.expire(s.id);
    const result = await db
      .from("payment_orders")
      .update({ status: "expired" })
      .eq("id", o.id)
      .eq("status", "pending");
    if (result.error) throw new Error("Update failed");
    return json({ ok: true });
  } catch {
    return json({ error: "关闭订单失败，请刷新后重试" }, 502);
  }
}
