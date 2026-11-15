/**
 * Deposit checkout and booking confirmation — the money path.
 *
 * startCheckout (planner clicks "Pay deposit"):
 *   1. re-check: planner owns the enquiry, quote is the current one, total within any strict cap,
 *      listing still published, day still confirmed open, not already booked
 *   2. HOLD the listing-day by inserting a pending checkout. A unique index allows only one
 *      pending checkout per listing per day, so two planners can't both start paying.
 *   3. ask the payment provider for a session (reused on retry)
 *
 * fulfilCheckout (provider says "paid"): idempotent and transactional.
 *   checks amount + GBP + still the active quote, then writes booking + payment + statuses together.
 *   A second "paid" event for the same session returns the same booking. The bookings table's
 *   unique (listing, date) makes a double-booking impossible even if two events race.
 */
import type { Db } from "@/lib/db";
import { notify } from "@/lib/adapters/email";
import { paymentProvider, type PaymentProvider } from "@/lib/adapters/payments";
import { formatPounds } from "@/lib/matching/pricing";
import { longDate } from "@/lib/format";
import { config } from "@/lib/config";
import { track } from "./analytics";
import { conflict, forbidden, invalid, isUniqueViolation, notFound, requireRole, shortCode, type Actor } from "./errors";
import { getEnquiryForParticipant, quoteExceedsCap, type QuoteRow } from "./enquiries";
import { balanceDueDate } from "@/lib/payments/policy";
import { fulfilBalance } from "./booking-money";
import { checkoutSummary } from "./checkout-summary";

/**
 * How long a date is held while the planner pays. Stripe needs a Checkout session to stay open for
 * at least 30 minutes, so the hold is a little longer than the Stripe session (see stripeExpiry).
 */
export const HOLD_MINUTES = 35;

export interface CheckoutRow {
  id: string;
  kind: "deposit" | "balance";
  booking_id: string | null;
  payment_intent_id: string | null;
  paid_at: Date | null;
  quote_id: string;
  enquiry_id: string;
  listing_id: string;
  event_date: string;
  provider: "demo" | "stripe";
  provider_session_id: string | null;
  amount_pence: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "expired" | "cancelled";
  failure_reason: string | null;
  expires_at: Date;
  created_at: Date;
}

export async function startCheckout(
  db: Db,
  actor: Actor | null,
  enquiryId: string,
  quoteId: string,
  provider: PaymentProvider = paymentProvider(),
): Promise<{ checkoutId: string; url: string }> {
  const { enquiry, listing, side } = await getEnquiryForParticipant(db, actor, enquiryId);
  if (side !== "planner") throw forbidden("Only the planner pays the deposit.");

  let checkout: CheckoutRow;
  try {
    checkout = await db.transaction(async (tx) => {
      const [quote] = await tx.query<QuoteRow>("select * from quotes where id = $1 and enquiry_id = $2 for update", [quoteId, enquiryId]);
      if (!quote) throw notFound("Quote not found.");
      if (quote.status !== "active") throw conflict(`Quote ${quote.reference} has been replaced or closed. Only the current quote can be paid.`);
      if (enquiry.status === "booked") throw conflict("This enquiry is already booked.");
      const cap = quoteExceedsCap(enquiry, quote);
      if (cap !== null) {
        throw conflict(`This quote (${formatPounds(quote.total_pence)}) is above your strict budget cap of ${formatPounds(cap)}. Ask the venue for a revised quote, or decline it.`);
      }

      const [fresh] = await tx.query<{ is_published: boolean }>("select is_published from listings where id = $1", [listing.id]);
      const [day] = await tx.query<{ state: string }>("select state from listing_days where listing_id = $1 and day = $2", [listing.id, enquiry.event_date]);
      const [booked] = await tx.query("select id from bookings where listing_id = $1 and event_date = $2 and status = 'confirmed'", [listing.id, enquiry.event_date]);
      if (!fresh?.is_published || day?.state !== "open" || booked) {
        throw conflict("Sorry — this venue is no longer available on your date. Message the venue or search again.");
      }

      // Retry: the same quote already has a live hold → reuse it rather than creating another.
      const [mine] = await tx.query<CheckoutRow>(
        "select * from checkouts where quote_id = $1 and kind = 'deposit' and status = 'pending' and expires_at > now() order by created_at desc limit 1",
        [quoteId],
      );
      if (mine) return mine;

      // Someone else's hold on this listing-day: release it only if it's verifiably expired and unpaid.
      const holds = await tx.query<CheckoutRow>(
        "select * from checkouts where listing_id = $1 and event_date = $2 and status = 'pending' and kind = 'deposit'",
        [listing.id, enquiry.event_date],
      );
      for (const hold of holds) {
        const expired = new Date(hold.expires_at) <= new Date();
        const verified = expired && (!hold.provider_session_id || (await provider.isExpiredAndUnpaid(hold.provider_session_id)));
        if (!verified) throw conflict("Another booking for this venue and date is being paid for right now. Please try again in about 30 minutes.");
        await tx.query("update checkouts set status = 'expired', updated_at = now() where id = $1", [hold.id]);
      }

      const [row] = await tx.query<CheckoutRow>(
        `insert into checkouts (quote_id, enquiry_id, listing_id, event_date, provider, amount_pence, expires_at)
         values ($1,$2,$3,$4,$5,$6, now() + interval '${HOLD_MINUTES} minutes') returning *`,
        [quote.id, enquiryId, listing.id, enquiry.event_date, provider.kind, quote.deposit_pence],
      );
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("Another booking for this venue and date is being paid for right now. Please try again in about 30 minutes.");
    }
    throw error;
  }

  if (checkout.provider_session_id && provider.kind === "demo") return { checkoutId: checkout.id, url: `/checkout/demo/${checkout.id}` };

  try {
    const [quote] = await db.query<QuoteRow>("select * from quotes where id = $1", [checkout.quote_id]);
    const shown = await checkoutSummary(db, listing.id, enquiryId);
    const session = await provider.createSession({
      summary: shown.summary || undefined,
      imagePath: shown.imagePath ?? undefined,
      checkoutId: checkout.id,
      purpose: "deposit",
      quoteReference: quote.reference,
      venueName: listing.name,
      amountPence: checkout.amount_pence,
      expiresAt: new Date(checkout.expires_at),
    });
    await db.query("update checkouts set provider_session_id = $2, updated_at = now() where id = $1", [checkout.id, session.sessionId]);
    await track(db, "checkout_started", actor!.id, { enquiryId, provider: provider.kind });
    return { checkoutId: checkout.id, url: session.url };
  } catch (error) {
    // Creating the session definitely failed, so it's safe to release the hold.
    await db.query("update checkouts set status = 'failed', failure_reason = $2, updated_at = now() where id = $1 and status = 'pending'", [
      checkout.id,
      "Could not start the payment page",
    ]);
    console.error("Payment session creation failed", (error as Error).message);
    throw conflict("We couldn't open the payment page. Nothing was charged. Please try again.");
  }
}

export interface PaidEvent {
  providerSessionId: string;
  amountPence: number;
  currency: string;
  /** The provider's payment id, needed later to refund this exact payment. */
  paymentIntentId?: string | null;
}

export type FulfilResult =
  | { status: "booked"; bookingId: string; reference: string; alreadyProcessed: boolean }
  | { status: "balance_paid"; bookingId: string; alreadyProcessed: boolean }
  | { status: "rejected"; reason: string };

export async function fulfilCheckout(db: Db, event: PaidEvent, provider: PaymentProvider = paymentProvider()): Promise<FulfilResult> {
  const [kindRow] = await db.query<{ kind: string }>("select kind from checkouts where provider_session_id = $1", [event.providerSessionId]);
  if (kindRow?.kind === "balance") return fulfilBalance(db, event, provider);
  let result: FulfilResult;
  try {
    result = await db.transaction(async (tx): Promise<FulfilResult> => {
      const [checkout] = await tx.query<CheckoutRow>("select * from checkouts where provider_session_id = $1 for update", [event.providerSessionId]);
      if (!checkout) return { status: "rejected", reason: "Unknown checkout session" };

      if (checkout.status === "paid") {
        const [b] = await tx.query<{ id: string; reference: string }>("select id, reference from bookings where checkout_id = $1", [checkout.id]);
        return { status: "booked", bookingId: b.id, reference: b.reference, alreadyProcessed: true }; // duplicate event
      }
      if (event.currency.toUpperCase() !== "GBP" || event.amountPence !== checkout.amount_pence) {
        await tx.query("update checkouts set status = 'failed', failure_reason = 'Amount or currency mismatch', updated_at = now() where id = $1", [checkout.id]);
        return { status: "rejected", reason: "Amount or currency did not match the quote" };
      }
      const [quote] = await tx.query<QuoteRow>("select * from quotes where id = $1 for update", [checkout.quote_id]);
      if (quote.status !== "active") {
        await tx.query("update checkouts set status = 'failed', failure_reason = 'Quote no longer current', updated_at = now() where id = $1", [checkout.id]);
        return { status: "rejected", reason: "The quote was replaced before payment completed" };
      }
      const [enquiry] = await tx.query<{ planner_id: string }>("select planner_id from enquiries where id = $1", [checkout.enquiry_id]);
      // The terms agreed on the quote are copied onto the booking, so later venue changes never alter it.
      const dueDate = quote.balance_due_days === null ? null : balanceDueDate(String(checkout.event_date), quote.balance_due_days);
      const fullyPaid = checkout.amount_pence >= quote.total_pence; // deposit covers everything: no second payment
      const [b] = await tx.query<{ id: string; reference: string }>(
        `insert into bookings (reference, enquiry_id, quote_id, checkout_id, listing_id, planner_id, event_date, total_pence, deposit_pence,
           balance_due_date, cancellation_cutoff_days, cancellation_terms, paid_in_full_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, case when $13 then now() end) returning id, reference`,
        [`BK-${shortCode(5)}`, checkout.enquiry_id, quote.id, checkout.id, checkout.listing_id, enquiry.planner_id, checkout.event_date, quote.total_pence, checkout.amount_pence,
         dueDate, quote.cancellation_cutoff_days, quote.cancellation_terms, fullyPaid],
      );
      await tx.query("update checkouts set status = 'paid', paid_at = now(), booking_id = $2, payment_intent_id = $3, updated_at = now() where id = $1", [checkout.id, b.id, event.paymentIntentId ?? null]);
      await tx.query("update quotes set status = 'paid' where id = $1", [quote.id]);
      await tx.query("update enquiries set status = 'booked', updated_at = now() where id = $1", [checkout.enquiry_id]);
      return { status: "booked", bookingId: b.id, reference: b.reference, alreadyProcessed: false };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // The listing-day was booked by someone else first. This booking is not confirmed.
      await db.query("update checkouts set status = 'failed', failure_reason = 'Date already booked', updated_at = now() where provider_session_id = $1 and status = 'pending'", [event.providerSessionId]);
      return { status: "rejected", reason: "That date was booked by someone else first" };
    }
    throw error;
  }

  if (result.status === "booked" && !result.alreadyProcessed) await announceBooking(db, result.bookingId);
  return result;
}

/** Payments are test-only in this build: demo mode, or Stripe with a test key. Emails and pages say so. */
export function paymentsAreTest(): boolean {
  const p = config().payments;
  return p.kind === "demo" || p.secretKey.startsWith("sk_test_") || p.secretKey.startsWith("rk_test_");
}

/** What a confirmed booking costs and what's left to pay through Gather. */
export function balanceFacts(totalPence: number, paidPence: number, dueDate?: string | null): [string, string][] {
  const remaining = totalPence - paidPence;
  return [
    ["Booking total", formatPounds(totalPence)],
    ["Paid through Gather", formatPounds(paidPence)],
    [remaining > 0 && dueDate ? `Remaining balance (due by ${longDate(dueDate)})` : "Remaining balance", remaining > 0 ? formatPounds(remaining) : "£0 (paid in full)"],
  ];
}

export const BALANCE_NOTE = "The deposit confirms the booking and blocks the date. Pay the remaining balance through Gather from My bookings before it's due.";

async function announceBooking(db: Db, bookingId: string) {
  const [b] = await db.query<{ enquiry_id: string; reference: string; planner_id: string; planner_email: string; planner_name: string; owner_email: string; listing_name: string; event_date: string; total_pence: number; deposit_pence: number; guests: number; quote_reference: string; balance_due_date: string | null; cancellation_terms: string | null; paid_in_full_at: Date | null }>(
    `select b.enquiry_id, b.reference, b.planner_id, pp.email as planner_email, pp.full_name as planner_name, po.email as owner_email, l.name as listing_name,
            b.event_date::text as event_date, b.total_pence, b.deposit_pence, e.guests, q.reference as quote_reference,
            b.balance_due_date::text as balance_due_date, b.cancellation_terms, b.paid_in_full_at
     from bookings b join listings l on l.id = b.listing_id join profiles pp on pp.id = b.planner_id join profiles po on po.id = l.owner_id
     join enquiries e on e.id = b.enquiry_id join quotes q on q.id = b.quote_id
     where b.id = $1`,
    [bookingId],
  );
  const path = `/enquiries/${b.enquiry_id}`;
  const when = longDate(b.event_date);
  const facts = balanceFacts(Number(b.total_pence), Number(b.deposit_pence), b.balance_due_date);
  if (b.cancellation_terms) facts.push(["Cancellation terms", "Shown on the booking in Gather"]);
  const testPayment = paymentsAreTest();
  const remaining = Number(b.total_pence) - Number(b.deposit_pence);
  const paid = b.paid_in_full_at !== null;
  await notify(db, {
    toEmail: b.planner_email, toRole: "planner", template: "booking_confirmed",
    subject: `Booking ${b.reference} confirmed at ${b.listing_name}`,
    preheader: paid ? `${when}: paid in full.` : `${when}: deposit ${formatPounds(Number(b.deposit_pence))} paid, ${formatPounds(remaining)} to pay through Gather.`,
    heading: "Your booking is confirmed",
    reference: b.reference,
    paragraphs: [
      `${b.listing_name} is booked for ${when} for ${b.guests} guests, on quote ${b.quote_reference}. The date is now blocked in the venue's calendar.`,
      paid ? "Your deposit covered the full amount, so there's nothing more to pay." : BALANCE_NOTE,
      ...(b.cancellation_terms ? [`Cancellation terms: ${b.cancellation_terms}`] : []),
    ],
    facts, testPayment, path,
  });
  await notify(db, {
    toEmail: b.owner_email, toRole: "owner", template: "booking_confirmed",
    subject: `New booking ${b.reference} for ${when}`,
    preheader: `${b.planner_name} paid the deposit for ${when}.`,
    heading: `${b.listing_name} is booked`,
    reference: b.reference,
    paragraphs: [
      `${b.planner_name} paid the deposit on quote ${b.quote_reference} for ${when} (${b.guests} guests). Gather has blocked the date in your calendar.`,
      paid ? "The deposit covered the full amount." : "The planner pays the remaining balance through Gather; you'll get an email when the booking is paid in full.",
    ],
    facts, testPayment, path,
  });
  await track(db, "booking_confirmed", b.planner_id, { bookingId });
}

/** Payment declined or failed: the hold is released and the planner can try again. */
export async function failCheckout(db: Db, providerSessionId: string, reason: string) {
  const rows = await db.query<{ planner_id: string }>(
    `update checkouts c set status = 'failed', failure_reason = $2, updated_at = now()
     from enquiries e where e.id = c.enquiry_id and c.provider_session_id = $1 and c.status = 'pending'
     returning e.planner_id`,
    [providerSessionId, reason.slice(0, 200)],
  );
  if (rows[0]) await track(db, "payment_failed", rows[0].planner_id, {});
}

export async function expireCheckout(db: Db, providerSessionId: string) {
  await db.query("update checkouts set status = 'expired', updated_at = now() where provider_session_id = $1 and status = 'pending'", [providerSessionId]);
}

export async function getCheckoutForPlanner(db: Db, actor: Actor | null, checkoutId: string) {
  const planner = requireRole(actor, "planner");
  if (!/^[0-9a-f-]{36}$/i.test(checkoutId)) throw notFound("Checkout not found.");
  const [row] = await db.query<CheckoutRow & { planner_id: string; quote_reference: string; quote_total: number; listing_name: string; booking_reference: string | null; booking_ref_id: string | null }>(
    `select c.*, e.planner_id, q.reference as quote_reference, q.total_pence as quote_total, l.name as listing_name,
       (select reference from bookings b where b.checkout_id = c.id or b.id = c.booking_id limit 1) as booking_reference,
       (select id from bookings b where b.checkout_id = c.id or b.id = c.booking_id limit 1) as booking_ref_id
     from checkouts c join enquiries e on e.id = c.enquiry_id join quotes q on q.id = c.quote_id join listings l on l.id = c.listing_id
     where c.id = $1`,
    [checkoutId],
  );
  if (!row) throw notFound("Checkout not found.");
  if (row.planner_id !== planner.id) throw forbidden("That payment belongs to another planner.");
  return row;
}

/** Demo checkout only: the planner abandons the test payment page. */
export async function cancelDemoCheckout(db: Db, actor: Actor | null, checkoutId: string) {
  const checkout = await getCheckoutForPlanner(db, actor, checkoutId);
  if (checkout.provider !== "demo") throw invalid("Only demo checkouts can be cancelled here.");
  await db.query("update checkouts set status = 'cancelled', updated_at = now() where id = $1 and status = 'pending'", [checkoutId]);
}
