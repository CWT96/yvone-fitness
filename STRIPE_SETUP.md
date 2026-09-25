# Stripe one-time purchases

User selected manual monthly renewal. Checkout always uses payment mode, never subscription mode.

- Live account: acct_1UJRY9GmudGo0yp2 (wyfit).
- Sandbox: acct_1UJTEtGf6PxBJOtl (Yvonne Fitness Test).
- Vercel: vinclo/yvone-fitness only.
- Private environment variables: STRIPE_SECRET_KEY (restricted key), STRIPE_WEBHOOK_SECRET.
- STRIPE_MODE: disabled (default), test (coach only), live (members).
- Callback: https://www.yvonnefitness.com/api/stripe/webhook
- Snapshot events: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.expired, charge.refunded.
- Test orders never grant live credits/memberships or send purchase emails.
- Live prices are read server-side and snapshotted. Students can only buy for themselves.
- Single purchases grant 1-100 credits. Monthly purchases begin on the Pacific payment date and end one calendar month minus one day later; month-end clamps. Active overlapping monthly access blocks another checkout.
- Settlement verifies signature, order/session, amount, currency and live mode. Duplicate callbacks cannot duplicate entitlements.
- Refunds are recorded and flagged for coach reconciliation; existing journal entries are not silently removed.
- Order history uses 10 rows per page. Test orders are hidden from students.

Validation: 87 tests passed, production build passed, local student purchase UI verified.
Migration 202609250003_stripe_payments.sql applied to zhyxlzalrpwfsqpxfftt.
Restricted sandbox Checkout key saved to Vercel. User confirmed event destination and STRIPE_WEBHOOK_SECRET / STRIPE_MODE=test configured.
Pending: deploy payment implementation and exercise actual Stripe test Checkout, then separately enable live keys after live account verification.
