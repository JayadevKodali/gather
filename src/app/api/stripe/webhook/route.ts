/**
 * Stripe webhook (connected mode, test mode only).
 *
 * 1. Verify the signature against the RAW request body with STRIPE_WEBHOOK_SECRET; anything
 *    unsigned or tampered with is rejected.
 * 2. Checkout events (deposit or balance) go to fulfilCheckout(), the same function the demo path uses.
 *    Refund events (refund.updated, refund.failed) update that refund's status.
 *    Every handler is idempotent, so Stripe's retries and resends can't charge, book or refund twice.
 *
 * Events to enable on the endpoint: checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed, checkout.session.expired, refund.updated, refund.failed.
 */
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeClient } from "@/lib/adapters/payments";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { stripeRefundStatus } from "@/lib/adapters/payments";
import { applyRefundUpdate } from "@/lib/services/booking-money";
import { expireCheckout, failCheckout, fulfilCheckout } from "@/lib/services/checkout";

export async function POST(request: Request) {
  const cfg = config();
  if (cfg.payments.kind !== "stripe") return NextResponse.json({ error: "Stripe is not enabled (demo mode)" }, { status: 404 });

  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(rawBody, signature ?? "", cfg.payments.webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (event.livemode) return NextResponse.json({ error: "Live-mode events are not accepted" }, { status: 400 });

  const db = await getDb();
  const session = event.data.object as Stripe.Checkout.Session;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      if (session.payment_status === "paid") {
        const result = await fulfilCheckout(db, {
          providerSessionId: session.id,
          amountPence: session.amount_total ?? -1,
          currency: session.currency ?? "",
          paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
        });
        if (result.status === "rejected") console.warn("Stripe payment not turned into a booking:", result.reason, session.id);
      }
      break;
    case "checkout.session.async_payment_failed":
      await failCheckout(db, session.id, "Payment failed at Stripe");
      break;
    case "checkout.session.expired":
      await expireCheckout(db, session.id);
      break;
    case "refund.updated":
    case "refund.failed": {
      const refund = event.data.object as Stripe.Refund;
      await applyRefundUpdate(db, refund.id, event.type === "refund.failed" ? "failed" : stripeRefundStatus(refund.status), refund.failure_reason ?? null);
      break;
    }
  }
  return NextResponse.json({ received: true });
}
