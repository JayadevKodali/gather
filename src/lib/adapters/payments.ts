/**
 * Payment providers for the deposit and the remaining balance, and refunds. Two implementations of one interface:
 *
 *   demo   — an in-app test checkout page (/checkout/demo/<id>). 4242 4242 4242 4242 succeeds,
 *            4000 0000 0000 0002 is declined, 4000 0000 0000 5126 succeeds but its refund later fails
 *            (same behaviour as Stripe's test card). No money, no external service. Clearly labelled.
 *   stripe — Stripe Checkout and Refunds in TEST mode. Payments count only once a signed webhook confirms them.
 *
 * Both end in the same fulfilCheckout() / refund functions, so the rules are identical.
 */
import Stripe from "stripe";
import { config } from "@/lib/config";

export interface CheckoutSessionRequest {
  checkoutId: string;
  purpose: "deposit" | "balance";
  quoteReference: string;
  venueName: string;
  amountPence: number;
  expiresAt: Date;
  /** Shown on the payment page (design pass 3.13): e.g. "Sat 14 March 2027 · 60 guests". Display only. */
  summary?: string;
  /** Site path of the venue's cover photo, e.g. /images/venues/v01-loom-room.webp. Display only. */
  imagePath?: string;
}

export type RefundStatus = "pending" | "succeeded" | "failed";
export interface RefundResult { id: string; status: RefundStatus; failureReason?: string }

export interface PaymentProvider {
  kind: "demo" | "stripe";
  createSession(req: CheckoutSessionRequest): Promise<{ sessionId: string; url: string }>;
  /** True only if the provider confirms the session expired without being paid. */
  isExpiredAndUnpaid(sessionId: string): Promise<boolean>;
  /** Stop an open session being paid (used when a booking is cancelled). Best effort. */
  expireSession(sessionId: string): Promise<void>;
  /** Refund part or all of one original payment. The key makes retries return the same refund. */
  refund(paymentIntentId: string, amountPence: number, idempotencyKey: string): Promise<RefundResult>;
}

export const demoPayments: PaymentProvider = {
  kind: "demo",
  async createSession(req) {
    return { sessionId: `demo_${req.checkoutId}`, url: `/checkout/demo/${req.checkoutId}` };
  },
  async isExpiredAndUnpaid() {
    return true; // demo sessions have no external state; the hold's own expiry time decides
  },
  async expireSession() {},
  async refund(paymentIntentId, _amount, key) {
    // A payment made with the demo "refund fails" card can't be refunded, like Stripe's 4000 0000 0000 5126.
    if (paymentIntentId.includes("_refundfail_")) return { id: `demo_re_${key}`, status: "failed", failureReason: "The card can't receive refunds (demo card 4000 0000 0000 5126)" };
    return { id: `demo_re_${key}`, status: "succeeded" };
  },
};

/**
 * Stripe Checkout's expires_at must be 30 minutes to 24 hours after the session is created.
 * End the Stripe session 2 minutes before Gather's hold ends (so nobody can pay after the hold has
 * lapsed), but never sooner than 30.5 minutes from now.
 */
export function stripeExpiry(holdEndsAt: Date, now = Date.now()): number {
  const target = Math.max(holdEndsAt.getTime() - 2 * 60_000, now + 30.5 * 60_000);
  return Math.floor(target / 1000);
}

/**
 * The Stripe Checkout session for a deposit or balance. The product carries a description (quote, date,
 * guests) and the venue's photo so the payment page shows what is being paid for (design pass 3.13).
 * Amount, currency, metadata, expiry and the return URLs are unchanged. Stripe fetches the photo itself,
 * so it is only sent when the site is on a public https address.
 */
export function stripeSessionParams(req: CheckoutSessionRequest, appUrl: string, assetUrl: string): Stripe.Checkout.SessionCreateParams {
  const image = req.imagePath && /^https:\/\//.test(assetUrl) ? `${assetUrl}${req.imagePath}` : null;
  return {
    mode: "payment",
    currency: "gbp",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: req.amountPence,
          product_data: {
            name: `${req.purpose === "balance" ? "Remaining balance" : "Deposit"} — ${req.venueName}`,
            description: req.summary ? `Quote ${req.quoteReference} · ${req.summary}` : `Quote ${req.quoteReference}`,
            ...(image ? { images: [image] } : {}),
          },
        },
      },
    ],
    client_reference_id: req.checkoutId,
    metadata: { checkout_id: req.checkoutId, quote_reference: req.quoteReference, purpose: req.purpose },
    expires_at: stripeExpiry(req.expiresAt),
    success_url: `${appUrl}/checkout/return/${req.checkoutId}`,
    cancel_url: `${appUrl}/checkout/return/${req.checkoutId}?cancelled=1`,
  };
}

export function stripeClient(): Stripe {
  const cfg = config();
  if (cfg.payments.kind !== "stripe") throw new Error("Stripe is not configured (demo mode).");
  return new Stripe(cfg.payments.secretKey);
}

export const stripePayments: PaymentProvider = {
  kind: "stripe",
  async createSession(req) {
    const cfg = config();
    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.create(
      stripeSessionParams(req, cfg.appUrl, cfg.assetUrl),
      { idempotencyKey: `gather-checkout-${req.checkoutId}` }, // a retry returns the same session
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { sessionId: session.id, url: session.url };
  },
  async isExpiredAndUnpaid(sessionId) {
    const session = await stripeClient().checkout.sessions.retrieve(sessionId);
    return session.status === "expired" && session.payment_status !== "paid";
  },
  async expireSession(sessionId) {
    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === "open") await stripe.checkout.sessions.expire(sessionId);
  },
  async refund(paymentIntentId, amountPence, key) {
    const r = await stripeClient().refunds.create(
      { payment_intent: paymentIntentId, amount: amountPence, metadata: { gather_refund: key } },
      { idempotencyKey: `gather-refund-${key}` },
    );
    return { id: r.id, status: stripeRefundStatus(r.status), failureReason: r.failure_reason ?? undefined };
  },
};

/** Stripe refund status → Gather's three states. */
export function stripeRefundStatus(status: string | null | undefined): RefundStatus {
  if (status === "succeeded") return "succeeded";
  if (status === "failed" || status === "canceled") return "failed";
  return "pending"; // pending, requires_action
}

export function paymentProvider(): PaymentProvider {
  return config().payments.kind === "stripe" ? stripePayments : demoPayments;
}

export const DEMO_CARDS = {
  success: "4242424242424242",
  decline: "4000000000000002",
  refundFails: "4000000000005126",
} as const;
