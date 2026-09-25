import {
  acceptStripeEvent,
  paymentMode,
  stripeClient,
} from "@/lib/payments-server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return Response.json({ error: "Missing signature" }, { status: 400 });
  if (paymentMode() === "disabled")
    return Response.json({ error: "Not configured" }, { status: 503 });
  let event;
  try {
    const raw = await request.text();
    if (raw.length > 1000000) return new Response(null, { status: 413 });
    event = stripeClient().webhooks.constructEvent(
      raw,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    await acceptStripeEvent(event);
    return Response.json({ received: true });
  } catch {
    return Response.json(
      { error: "Processing failed; retry required" },
      { status: 500 },
    );
  }
}
