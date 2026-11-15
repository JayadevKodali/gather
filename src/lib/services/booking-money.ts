/**
 * Money after the deposit: the remaining balance, cancellations and refunds. All amounts are worked out
 * here on the server from the accepted quote and the payments the provider has confirmed. Nothing the
 * browser sends is trusted for an amount.
 *
 * Safety against repeats (double clicks, webhook retries, two tabs):
 *   - a booking has at most one open balance payment (unique index), reused on retry
 *   - a payment is marked paid once (status check under a row lock); a repeat event changes nothing
 *   - each original payment has at most one refund row (unique checkout_id), and the provider call uses
 *     that row's id as its idempotency key, so a retry returns the same refund
 *   - cancellation happens once (status check under a row lock); emails go out only on that transition
 *   - refund-confirmed emails are sent once per refund (notified_at is claimed atomically)
 */
import type { Db } from "@/lib/db";
import { notify } from "@/lib/adapters/email";
import { paymentProvider, type PaymentProvider, type RefundStatus } from "@/lib/adapters/payments";
import { longDate } from "@/lib/format";
import { formatPounds } from "@/lib/matching/pricing";
import { planCancellation, type CancellationPlan, type PaidPayment } from "@/lib/payments/policy";
import { track } from "./analytics";
import { balanceFacts, paymentsAreTest, type CheckoutRow, type FulfilResult, type PaidEvent } from "./checkout";
import { conflict, forbidden, notFound, requireRole, type Actor } from "./errors";
import { checkoutSummary } from "./checkout-summary";

export interface BookingMoneyRow {
  id: string;
  reference: string;
  enquiry_id: string;
  quote_id: string;
  listing_id: string;
  listing_name: string;
  owner_id: string;
  owner_email: string;
  owner_name: string;
  planner_id: string;
  planner_email: string;
  planner_name: string;
  event_date: string;
  total_pence: number;
  deposit_pence: number;
  status: "confirmed" | "cancelled";
  balance_due_date: string | null;
  cancellation_cutoff_days: number | null;
  cancellation_terms: string | null;
  paid_in_full_at: Date | null;
  cancelled_at: Date | null;
  cancelled_by: "planner" | "owner" | null;
  cancellation_outcome: "full_refund" | "deposit_retained" | "manual_review" | null;
  retained_pence: number;
  quote_reference: string;
}

export interface PaymentLine { id: string; kind: "deposit" | "balance"; amount_pence: number; status: CheckoutRow["status"]; paid_at: Date | null; failure_reason: string | null; created_at: Date }
export interface RefundLine { id: string; checkout_id: string; kind: "deposit" | "balance"; amount_pence: number; status: "review" | "pending" | "succeeded" | "failed" | "declined"; failure_reason: string | null; updated_at: Date }

const BOOKING_SQL = `
  select b.id, b.reference, b.enquiry_id, b.quote_id, b.listing_id, l.name as listing_name, l.owner_id, po.email as owner_email, po.full_name as owner_name,
         b.planner_id, pp.email as planner_email, pp.full_name as planner_name, b.event_date::text as event_date, b.total_pence, b.deposit_pence, b.status,
         b.balance_due_date::text as balance_due_date, b.cancellation_cutoff_days, b.cancellation_terms, b.paid_in_full_at, b.cancelled_at, b.cancelled_by,
         b.cancellation_outcome, b.retained_pence, q.reference as quote_reference
  from bookings b join listings l on l.id = b.listing_id join profiles po on po.id = l.owner_id join profiles pp on pp.id = b.planner_id
  join quotes q on q.id = b.quote_id`;

async function loadBooking(db: Db, bookingId: string): Promise<BookingMoneyRow> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) throw notFound("Booking not found.");
  const [b] = await db.query<BookingMoneyRow>(`${BOOKING_SQL} where b.id = $1`, [bookingId]);
  if (!b) throw notFound("Booking not found.");
  return b;
}

/** For pages that have already checked access (e.g. the enquiry thread). */
export const getBookingRow = (db: Db, bookingId: string) => loadBooking(db, bookingId);

/** The booking, if the signed-in planner made it or owns its venue. Admin can read any. */
export async function getBookingForParty(db: Db, actor: Actor | null, bookingId: string) {
  const user = requireRole(actor, "planner", "owner", "admin");
  const booking = await loadBooking(db, bookingId);
  const side = user.role === "admin" ? "admin" : user.id === booking.planner_id ? "planner" : user.id === booking.owner_id ? "owner" : null;
  if (!side) throw notFound("Booking not found."); // don't reveal other people's bookings
  return { booking, side: side as "planner" | "owner" | "admin" };
}

export async function bookingPayments(db: Db, bookingId: string) {
  const payments = await db.query<PaymentLine>(
    `select id, kind, amount_pence, status, paid_at, failure_reason, created_at from checkouts
     where booking_id = $1 or id = (select checkout_id from bookings where id = $1) order by created_at`,
    [bookingId],
  );
  const refunds = await db.query<RefundLine>(
    `select r.id, r.checkout_id, c.kind, r.amount_pence, r.status, r.failure_reason, r.updated_at
     from refunds r join checkouts c on c.id = r.checkout_id where r.booking_id = $1 order by r.created_at`,
    [bookingId],
  );
  const paidPence = payments.filter((p) => p.status === "paid").reduce((n, p) => n + Number(p.amount_pence), 0);
  return { payments, refunds, paidPence };
}

/** Summary used by both booking pages and the bookings list. */
export async function bookingMoney(db: Db, booking: Pick<BookingMoneyRow, "id" | "total_pence" | "status" | "paid_in_full_at">) {
  const { payments, refunds, paidPence } = await bookingPayments(db, booking.id);
  const remainingPence = booking.status === "confirmed" ? Math.max(0, Number(booking.total_pence) - paidPence) : 0;
  const openBalance = payments.find((p) => p.kind === "balance" && p.status === "pending");
  return { payments, refunds, paidPence, remainingPence, paidInFull: booking.paid_in_full_at !== null, openBalance };
}

// ---------- The remaining balance ----------

/** My bookings → Pay remaining balance. Opens (or reopens) one Stripe Checkout for exactly what's left. */
export async function startBalanceCheckout(db: Db, actor: Actor | null, bookingId: string, provider: PaymentProvider = paymentProvider()) {
  const planner = requireRole(actor, "planner");
  const booking = await loadBooking(db, bookingId);
  if (booking.planner_id !== planner.id) throw notFound("Booking not found.");
  if (booking.status !== "confirmed") throw conflict("This booking has been cancelled, so there's nothing to pay.");

  const checkout = await db.transaction(async (tx) => {
    await tx.query("select id from bookings where id = $1 for update", [bookingId]);
    const [{ paid }] = await tx.query<{ paid: number }>(
      "select coalesce(sum(amount_pence), 0)::int as paid from checkouts where status = 'paid' and (booking_id = $1 or id = (select checkout_id from bookings where id = $1))",
      [bookingId],
    );
    const remaining = Number(booking.total_pence) - Number(paid);
    if (remaining <= 0) throw conflict("This booking is already paid in full.");
    const [open] = await tx.query<CheckoutRow>("select * from checkouts where booking_id = $1 and kind = 'balance' and status = 'pending'", [bookingId]);
    if (open && new Date(open.expires_at) > new Date() && Number(open.amount_pence) === remaining) return open; // retry: same payment page
    if (open) await tx.query("update checkouts set status = 'expired', updated_at = now() where id = $1", [open.id]);
    const [row] = await tx.query<CheckoutRow>(
      `insert into checkouts (quote_id, enquiry_id, listing_id, event_date, provider, amount_pence, expires_at, kind, booking_id)
       values ($1, $2, $3, $4, $5, $6, now() + interval '23 hours', 'balance', $7) returning *`,
      [booking.quote_id, booking.enquiry_id, booking.listing_id, booking.event_date, provider.kind, remaining, bookingId],
    );
    return row;
  });

  try {
    const shown = await checkoutSummary(db, booking.listing_id, booking.enquiry_id);
    const session = await provider.createSession({
      summary: shown.summary || undefined, imagePath: shown.imagePath ?? undefined,
      checkoutId: checkout.id, purpose: "balance", quoteReference: booking.quote_reference, venueName: booking.listing_name,
      amountPence: Number(checkout.amount_pence), expiresAt: new Date(checkout.expires_at),
    });
    await db.query("update checkouts set provider_session_id = $2, updated_at = now() where id = $1", [checkout.id, session.sessionId]);
    await track(db, "balance_checkout_started", planner.id, { bookingId });
    return { checkoutId: checkout.id, url: session.url };
  } catch (error) {
    await db.query("update checkouts set status = 'failed', failure_reason = 'Could not start the payment page', updated_at = now() where id = $1 and status = 'pending'", [checkout.id]);
    console.error("Balance session creation failed", (error as Error).message);
    throw conflict("We couldn't open the payment page. Nothing was charged. Please try again.");
  }
}

/** Provider confirmed a balance payment. Paid in full only now. Arriving after a cancellation, it's refunded. */
export async function fulfilBalance(db: Db, event: PaidEvent, provider: PaymentProvider = paymentProvider()): Promise<FulfilResult> {
  const outcome = await db.transaction(async (tx) => {
    const [checkout] = await tx.query<CheckoutRow>("select * from checkouts where provider_session_id = $1 for update", [event.providerSessionId]);
    if (!checkout || !checkout.booking_id) return { result: { status: "rejected", reason: "Unknown checkout session" } as FulfilResult };
    const [booking] = await tx.query<{ id: string; status: string; total_pence: number; paid_in_full_at: Date | null }>(
      "select id, status, total_pence, paid_in_full_at from bookings where id = $1 for update", [checkout.booking_id]);
    if (checkout.status === "paid") return { result: { status: "balance_paid", bookingId: booking.id, alreadyProcessed: true } as FulfilResult };
    if (event.currency.toUpperCase() !== "GBP" || event.amountPence !== Number(checkout.amount_pence)) {
      await tx.query("update checkouts set status = 'failed', failure_reason = 'Amount or currency mismatch', updated_at = now() where id = $1", [checkout.id]);
      return { result: { status: "rejected", reason: "Amount or currency did not match" } as FulfilResult };
    }
    // Money arrived, so record it whatever else happened (even if this session was cancelled meanwhile).
    await tx.query("update checkouts set status = 'paid', paid_at = now(), payment_intent_id = $2, updated_at = now() where id = $1", [checkout.id, event.paymentIntentId ?? null]);
    if (booking.status === "cancelled") {
      // The booking was cancelled while this payment was in flight: give it straight back.
      await tx.query(
        "insert into refunds (booking_id, checkout_id, amount_pence, status) values ($1, $2, $3, 'pending') on conflict (checkout_id) do nothing",
        [booking.id, checkout.id, checkout.amount_pence],
      );
      return { result: { status: "balance_paid", bookingId: booking.id, alreadyProcessed: false } as FulfilResult, lateAfterCancel: true };
    }
    const [{ paid }] = await tx.query<{ paid: number }>(
      "select coalesce(sum(amount_pence), 0)::int as paid from checkouts where status = 'paid' and (booking_id = $1 or id = (select checkout_id from bookings where id = $1))",
      [booking.id],
    );
    let nowPaidInFull = false;
    if (Number(paid) >= Number(booking.total_pence) && !booking.paid_in_full_at) {
      await tx.query("update bookings set paid_in_full_at = now() where id = $1 and paid_in_full_at is null", [booking.id]);
      nowPaidInFull = true;
    }
    return { result: { status: "balance_paid", bookingId: booking.id, alreadyProcessed: false } as FulfilResult, nowPaidInFull };
  });
  if (outcome.lateAfterCancel && outcome.result.status === "balance_paid") await processRefunds(db, outcome.result.bookingId, provider);
  if (outcome.nowPaidInFull && outcome.result.status === "balance_paid") await announcePaidInFull(db, outcome.result.bookingId);
  return outcome.result;
}

async function announcePaidInFull(db: Db, bookingId: string) {
  const b = await loadBooking(db, bookingId);
  const when = longDate(b.event_date);
  const facts = balanceFacts(Number(b.total_pence), Number(b.total_pence));
  const testPayment = paymentsAreTest();
  const path = `/enquiries/${b.enquiry_id}`;
  await notify(db, { toEmail: b.planner_email, toRole: "planner", template: "balance_paid", subject: `Booking ${b.reference} is paid in full`, heading: "Paid in full", reference: b.reference,
    preheader: `${b.listing_name}, ${when}: nothing more to pay.`, paragraphs: [`Your remaining balance for ${b.listing_name} on ${when} has been received. There's nothing more to pay.`], facts, testPayment, path });
  await notify(db, { toEmail: b.owner_email, toRole: "owner", template: "balance_paid", subject: `Booking ${b.reference} is paid in full`, heading: `${b.planner_name} paid in full`, reference: b.reference,
    preheader: `${when}: the full ${formatPounds(Number(b.total_pence))} has been paid through Gather.`, paragraphs: [`${b.planner_name} has paid the remaining balance for ${when}. The booking is paid in full.`], facts, testPayment, path });
  await track(db, "booking_paid_in_full", b.planner_id, { bookingId });
}

// ---------- Cancellations ----------

async function paidPayments(db: Db, bookingId: string): Promise<PaidPayment[]> {
  const rows = await db.query<{ id: string; kind: "deposit" | "balance"; amount_pence: number }>(
    "select id, kind, amount_pence from checkouts where status = 'paid' and (booking_id = $1 or id = (select checkout_id from bookings where id = $1)) order by created_at",
    [bookingId],
  );
  return rows.map((r) => ({ checkoutId: r.id, kind: r.kind, amountPence: Number(r.amount_pence) }));
}

/** What cancelling would do right now, for the confirmation screen. */
export async function cancellationPreview(db: Db, actor: Actor | null, bookingId: string, now = new Date()) {
  const { booking, side } = await getBookingForParty(db, actor, bookingId);
  if (side === "admin") throw forbidden("Only the planner or the venue can cancel a booking.");
  if (booking.status === "cancelled") throw conflict("This booking is already cancelled.");
  const payments = await paidPayments(db, bookingId);
  const plan = planCancellation({ by: side, cutoffDays: booking.cancellation_cutoff_days, eventDate: booking.event_date, payments, now });
  return { booking, side, plan, fingerprint: fingerprint(plan) };
}

const fingerprint = (p: CancellationPlan) => `${p.outcome}:${p.refundPence}:${p.retainedPence}:${p.reviewPence}`;

/**
 * Cancel a booking. `expected` is the fingerprint the person confirmed; if the numbers changed since
 * (for example midnight passed the cutoff), nothing happens and they're asked to review again.
 */
export async function cancelBooking(db: Db, actor: Actor | null, bookingId: string, expected: string, provider: PaymentProvider = paymentProvider(), now = new Date()) {
  const { side } = await getBookingForParty(db, actor, bookingId);
  if (side === "admin") throw forbidden("Only the planner or the venue can cancel a booking.");

  const done = await db.transaction(async (tx) => {
    const [b] = await tx.query<{ status: string; event_date: string; cancellation_cutoff_days: number | null }>(
      "select status, event_date::text as event_date, cancellation_cutoff_days from bookings where id = $1 for update", [bookingId]);
    if (b.status === "cancelled") return { already: true as const };
    const payments = await paidPayments(tx, bookingId);
    const plan = planCancellation({ by: side, cutoffDays: b.cancellation_cutoff_days, eventDate: b.event_date, payments, now });
    if (fingerprint(plan) !== expected) throw conflict("The cancellation terms have changed since you checked (for example, the cutoff date has passed). Please review them again.");
    await tx.query(
      `update bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancellation_outcome = $3, retained_pence = $4 where id = $1`,
      [bookingId, side, plan.outcome, plan.retainedPence],
    );
    // Stop collecting any outstanding balance.
    const open = await tx.query<{ id: string; provider_session_id: string | null }>(
      "update checkouts set status = 'cancelled', updated_at = now() where booking_id = $1 and kind = 'balance' and status = 'pending' returning id, provider_session_id",
      [bookingId],
    );
    for (const r of plan.refunds) {
      await tx.query("insert into refunds (booking_id, checkout_id, amount_pence, status) values ($1, $2, $3, $4) on conflict (checkout_id) do nothing", [bookingId, r.checkoutId, r.amountPence, r.status]);
    }
    return { already: false as const, plan, openSessions: open.map((o) => o.provider_session_id).filter((x): x is string => !!x) };
  });
  if (done.already) return { alreadyCancelled: true };

  for (const sid of done.openSessions) await provider.expireSession(sid).catch((e) => console.warn("[gather] couldn't expire balance session", (e as Error).message));
  await announceCancellation(db, bookingId, done.plan);
  await processRefunds(db, bookingId, provider);
  await track(db, "booking_cancelled", actor!.id, { bookingId, by: side, outcome: done.plan.outcome });
  return { alreadyCancelled: false, plan: done.plan };
}

async function announceCancellation(db: Db, bookingId: string, plan: CancellationPlan) {
  const b = await loadBooking(db, bookingId);
  const when = longDate(b.event_date);
  const by = b.cancelled_by === "owner" ? `${b.listing_name} cancelled` : `${b.planner_name} cancelled`;
  const facts: [string, string][] = [["Refund to the planner", formatPounds(plan.refundPence)], ["Kept by the venue", formatPounds(plan.retainedPence)]];
  if (plan.reviewPence) facts.push(["Deposit under review by Gather", formatPounds(plan.reviewPence)]);
  const testPayment = paymentsAreTest();
  const path = `/enquiries/${b.enquiry_id}`;
  const lines = [`${by} the booking for ${when}. The date is free again in the venue's calendar.`, plan.explanation, ...(plan.refundPence ? ["Refunds go back to the original card. We'll email again when each refund is confirmed."] : [])];
  await notify(db, { toEmail: b.planner_email, toRole: "planner", template: "booking_cancelled", subject: `Booking ${b.reference} cancelled`, heading: "Booking cancelled", reference: b.reference,
    preheader: `${b.listing_name}, ${when}. Refund ${formatPounds(plan.refundPence)}.`, paragraphs: lines, facts, testPayment, path });
  await notify(db, { toEmail: b.owner_email, toRole: "owner", template: "booking_cancelled", subject: `Booking ${b.reference} cancelled`, heading: "Booking cancelled", reference: b.reference,
    preheader: `${when} is free again. You keep ${formatPounds(plan.retainedPence)}.`, paragraphs: lines, facts, testPayment, path });
}

// ---------- Refunds ----------

/** Send every refund that's ready (pending, not yet sent to the provider) and record what happened. */
export async function processRefunds(db: Db, bookingId: string, provider: PaymentProvider = paymentProvider()) {
  const due = await db.query<{ id: string; amount_pence: number; payment_intent_id: string | null; provider: string }>(
    `select r.id, r.amount_pence, c.payment_intent_id, c.provider from refunds r join checkouts c on c.id = r.checkout_id
     where r.booking_id = $1 and r.status = 'pending' and r.provider_refund_id is null`,
    [bookingId],
  );
  for (const r of due) {
    if (!r.payment_intent_id) {
      await setRefund(db, r.id, "failed", null, "The original payment has no provider reference, so it can't be refunded automatically.");
      continue;
    }
    try {
      const result = await provider.refund(r.payment_intent_id, Number(r.amount_pence), r.id);
      await setRefund(db, r.id, result.status, result.id, result.failureReason ?? null);
    } catch (error) {
      // The provider call itself failed. Mark it failed with the reason; the admin can retry it from the dashboard.
      await setRefund(db, r.id, "failed", null, String((error as Error).message).slice(0, 200));
    }
  }
}

/** Record a refund's state. A refund only moves forward (pending → succeeded/failed); repeats change nothing. */
async function setRefund(db: Db, refundId: string, status: RefundStatus, providerRefundId: string | null, reason: string | null) {
  await db.query(
    `update refunds set status = $2, provider_refund_id = coalesce(provider_refund_id, $3), failure_reason = $4, updated_at = now()
     where id = $1 and status in ('pending', 'failed')`,
    [refundId, status, providerRefundId, reason],
  );
  if (status === "succeeded") await announceRefund(db, refundId);
}

/** Webhook: Stripe says a refund changed (refund.updated / refund.failed). Unknown refunds are ignored. */
export async function applyRefundUpdate(db: Db, providerRefundId: string, status: RefundStatus, reason: string | null) {
  const [r] = await db.query<{ id: string; status: string }>("select id, status from refunds where provider_refund_id = $1", [providerRefundId]);
  if (!r || r.status === "succeeded" || r.status === status) return false; // duplicate event or already final
  await setRefund(db, r.id, status, providerRefundId, reason);
  return true;
}

async function announceRefund(db: Db, refundId: string) {
  // Claim the notification so a repeated event can't send it twice.
  const [r] = await db.query<{ booking_id: string; amount_pence: number }>(
    "update refunds set notified_at = now() where id = $1 and status = 'succeeded' and notified_at is null returning booking_id, amount_pence", [refundId]);
  if (!r) return;
  const b = await loadBooking(db, r.booking_id);
  const amount = formatPounds(Number(r.amount_pence));
  const testPayment = paymentsAreTest();
  const path = `/enquiries/${b.enquiry_id}`;
  await notify(db, { toEmail: b.planner_email, toRole: "planner", template: "refund_confirmed", subject: `Refund of ${amount} confirmed (${b.reference})`, heading: "Your refund is confirmed", reference: b.reference,
    preheader: `${amount} is on its way back to your card.`, paragraphs: [`${amount} for your cancelled booking at ${b.listing_name} has been refunded to the original card. Banks usually show it within 5–10 working days.`], testPayment, path });
  await notify(db, { toEmail: b.owner_email, toRole: "owner", template: "refund_confirmed", subject: `Refund of ${amount} confirmed (${b.reference})`, heading: "Refund confirmed", reference: b.reference,
    preheader: `${amount} refunded to ${b.planner_name}.`, paragraphs: [`${amount} has been refunded to ${b.planner_name} for the cancelled booking on ${longDate(b.event_date)}.`], testPayment, path });
}

// ---------- Admin follow-up ----------

export async function refundsNeedingAttention(db: Db, actor: Actor | null) {
  requireRole(actor, "admin");
  return db.query<{ id: string; status: string; amount_pence: number; failure_reason: string | null; reference: string; listing: string; booking_id: string; updated_at: Date }>(
    `select r.id, r.status, r.amount_pence, r.failure_reason, b.reference, l.name as listing, b.id as booking_id, r.updated_at
     from refunds r join bookings b on b.id = r.booking_id join listings l on l.id = b.listing_id
     where r.status in ('review', 'failed') order by r.updated_at desc limit 20`,
  );
}

/** Admin: retry a failed refund, or decide a review (refund the deposit, or let the venue keep it). */
export async function resolveRefund(db: Db, actor: Actor | null, refundId: string, decision: "retry" | "refund" | "keep", provider: PaymentProvider = paymentProvider()) {
  requireRole(actor, "admin");
  if (!/^[0-9a-f-]{36}$/i.test(refundId)) throw notFound();
  const [r] = await db.query<{ status: string; booking_id: string; amount_pence: number }>("select status, booking_id, amount_pence from refunds where id = $1", [refundId]);
  if (!r) throw notFound();
  if (decision === "retry") {
    if (r.status !== "failed") throw conflict("Only a failed refund can be retried.");
    // A new attempt needs a new provider idempotency key, so start a fresh row for the same payment.
    await db.transaction(async (tx) => {
      const [old] = await tx.query<{ checkout_id: string }>("delete from refunds where id = $1 and status = 'failed' returning checkout_id", [refundId]);
      if (!old) throw conflict("This refund has already been retried.");
      await tx.query("insert into refunds (booking_id, checkout_id, amount_pence, status) values ($1, $2, $3, 'pending')", [r.booking_id, old.checkout_id, r.amount_pence]);
    });
  } else {
    if (r.status !== "review") throw conflict("This refund isn't waiting for a decision.");
    if (decision === "refund") await db.query("update refunds set status = 'pending', updated_at = now() where id = $1 and status = 'review'", [refundId]);
    else {
      await db.query("update refunds set status = 'declined', updated_at = now() where id = $1 and status = 'review'", [refundId]);
      await db.query("update bookings set retained_pence = retained_pence + $2 where id = $1", [r.booking_id, r.amount_pence]);
    }
  }
  await processRefunds(db, r.booking_id, provider);
}

