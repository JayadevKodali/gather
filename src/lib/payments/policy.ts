/**
 * Booking money rules, as plain functions (no database), so they're easy to test and read.
 *
 * Cancellation (terms are saved with the accepted quote; later venue changes never apply):
 *   - The venue cancels: every payment made through Gather is refunded in full.
 *   - The planner cancels, with a cutoff of N days (counted in London calendar days):
 *       N + 1 or more days before the event → the deposit is refunded
 *       N days or fewer before the event    → the venue keeps the deposit
 *     Any balance already paid is always refunded, and any outstanding balance is no longer collected.
 *   - Older bookings made before terms existed: a planner cancellation refunds any balance but the deposit
 *     goes to manual review, so no money is kept without a person deciding.
 */
import { formatPounds } from "@/lib/matching/pricing";

export const DEFAULT_CUTOFF_DAYS = 14;
export const DEFAULT_BALANCE_DUE_DAYS = 14;

/** Today's date in London (YYYY-MM-DD), whatever the server's time zone. */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Whole calendar days from today (London) to the event date. 0 = the event is today. */
export function daysBeforeEvent(eventDate: string, now: Date = new Date()): number {
  const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((toUtc(eventDate) - toUtc(londonToday(now))) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + days));
  return d.toISOString().slice(0, 10);
}

/** The balance is due this many days before the event, but never before today. */
export function balanceDueDate(eventDate: string, dueDays: number, now: Date = new Date()): string {
  const due = addDays(eventDate, -dueDays);
  const today = londonToday(now);
  return due < today ? today : due;
}

/** The plain-English terms saved with a quote and shown on the booking. */
export function cancellationTerms(cutoffDays: number): string {
  const free = cutoffDays + 1;
  return (
    `If you cancel ${free} or more days before the event, your deposit is refunded. ` +
    `If you cancel ${cutoffDays === 0 ? "on the day of the event" : `${cutoffDays} day${cutoffDays === 1 ? "" : "s"} or fewer before the event`}, the venue keeps the deposit. ` +
    "Any balance you've paid through Gather is always refunded. If the venue cancels, you get everything back."
  );
}

export interface PaidPayment { checkoutId: string; kind: "deposit" | "balance"; amountPence: number }
export type CancellationOutcome = "full_refund" | "deposit_retained" | "manual_review";

export interface CancellationPlan {
  outcome: CancellationOutcome;
  daysBefore: number;
  refunds: { checkoutId: string; kind: "deposit" | "balance"; amountPence: number; status: "pending" | "review" }[];
  refundPence: number;
  retainedPence: number;
  reviewPence: number;
  explanation: string;
}

export function planCancellation(input: {
  by: "planner" | "owner";
  cutoffDays: number | null;
  eventDate: string;
  payments: PaidPayment[];
  now?: Date;
}): CancellationPlan {
  const daysBefore = daysBeforeEvent(input.eventDate, input.now);
  const deposits = input.payments.filter((p) => p.kind === "deposit");
  const balances = input.payments.filter((p) => p.kind === "balance");
  const sum = (ps: PaidPayment[]) => ps.reduce((n, p) => n + p.amountPence, 0);
  const refund = (ps: PaidPayment[], status: "pending" | "review" = "pending") => ps.map((p) => ({ checkoutId: p.checkoutId, kind: p.kind, amountPence: p.amountPence, status }));

  let outcome: CancellationOutcome;
  let refunds: CancellationPlan["refunds"];
  let explanation: string;
  if (input.by === "owner") {
    outcome = "full_refund";
    refunds = refund(input.payments);
    explanation = "The venue is cancelling, so the planner gets back everything paid through Gather.";
  } else if (input.cutoffDays === null) {
    outcome = "manual_review";
    refunds = [...refund(balances), ...refund(deposits, "review")];
    explanation = "This booking was made before cancellation terms were agreed, so Gather will review the deposit before anything is kept. Any balance paid is refunded now.";
  } else if (daysBefore > input.cutoffDays) {
    outcome = "full_refund";
    refunds = refund(input.payments);
    explanation = `You're cancelling ${daysBefore} days before the event, which is more than the ${input.cutoffDays}-day cutoff, so your deposit is refunded.`;
  } else {
    outcome = "deposit_retained";
    refunds = refund(balances);
    explanation = `You're cancelling ${daysBefore} day${daysBefore === 1 ? "" : "s"} before the event, within the ${input.cutoffDays}-day cutoff, so the venue keeps the deposit${balances.length ? ". The balance you paid is refunded" : ""}.`;
  }
  const refundPence = refunds.filter((r) => r.status === "pending").reduce((n, r) => n + r.amountPence, 0);
  const reviewPence = refunds.filter((r) => r.status === "review").reduce((n, r) => n + r.amountPence, 0);
  return { outcome, daysBefore, refunds, refundPence, reviewPence, retainedPence: sum(input.payments) - refundPence - reviewPence, explanation };
}

export const describePlan = (p: CancellationPlan) =>
  `Refund ${formatPounds(p.refundPence)}${p.reviewPence ? `, ${formatPounds(p.reviewPence)} under review` : ""}; venue keeps ${formatPounds(p.retainedPence)}`;
