/**
 * A booking's money and status, the same for both sides: what was paid, what's left (and when it's due),
 * the cancellation terms saved with the accepted quote, refunds, and the planner's "Pay remaining balance".
 * "Paid in full" appears only once the payment provider has confirmed every payment.
 */
import Link from "next/link";
import { payBalanceAction } from "@/app/actions/enquiry";
import type { Db } from "@/lib/db";
import { dateTime, formatPounds, longDate } from "@/lib/format";
import { bookingMoney, getBookingRow, type RefundLine } from "@/lib/services/booking-money";
import { termsForViewer } from "@/lib/services/enquiries";
import { paymentsAreTest } from "@/lib/services/checkout";
import { SubmitButton } from "./SubmitButton";
import { StatusPill } from "@/components/StatusPill";

export const REFUND_LABEL: Record<RefundLine["status"], [string, string]> = {
  pending: ["amber", "Refund pending"],
  succeeded: ["green", "Refunded"],
  failed: ["red", "Refund failed"],
  review: ["amber", "Under review by Gather"],
  declined: ["grey", "Kept by the venue after review"],
};

export async function BookingPanel({ db, bookingId, side }: { db: Db; bookingId: string; side: "planner" | "owner" }) {
  const b = await getBookingRow(db, bookingId);
  const m = await bookingMoney(db, b);
  const test = paymentsAreTest();
  const cancelled = b.status === "cancelled";
  const deposit = m.payments.find((p) => p.kind === "deposit" && p.status === "paid");
  const balancesPaid = m.payments.filter((p) => p.kind === "balance" && p.status === "paid");
  const lastBalance = [...m.payments].reverse().find((p) => p.kind === "balance");
  const balanceFailed = !cancelled && lastBalance && lastBalance.status === "failed" ? lastBalance : null;

  // Journey tracker (3.14): Enquiry sent → Quote received → Deposit paid → Paid in full / Cancelled.
  const steps: { label: string; state: "done" | "now" | "todo" | "stopped" }[] = [
    { label: "Enquiry sent", state: "done" },
    { label: "Quote received", state: "done" },
    { label: "Deposit paid", state: deposit ? "done" : "now" },
    cancelled ? { label: "Cancelled", state: "stopped" } : { label: "Paid in full", state: m.paidInFull ? "done" : "now" },
  ];

  return (
    <section className={`panel booking-panel ${cancelled ? "cancelled" : m.paidInFull ? "settled" : ""}`} aria-labelledby="booking-title">
      <div className="spread">
        <h2 id="booking-title" className="mb-0">Booking {b.reference} {cancelled ? "cancelled" : "confirmed"}</h2>
        <StatusPill tone={cancelled ? "red" : m.paidInFull ? "green" : "amber"}>{cancelled ? "Cancelled" : m.paidInFull ? "Paid in full" : "Balance due"}</StatusPill>
      </div>
      <p className="mt-s mb-0 muted">{longDate(b.event_date)} at {b.listing_name}</p>

      <ol className="btrack" aria-label="Where this booking is">
        {steps.map((st) => (
          <li key={st.label} className={`btrack-step ${st.state}`} aria-current={st.state === "now" ? "step" : undefined}>
            <span className="btrack-dot" aria-hidden="true">{st.state === "done" ? "✓" : st.state === "stopped" ? "✕" : ""}</span>
            <span>{st.label}</span>
          </li>
        ))}
      </ol>

      {/* The one thing to do next, kept on its own. */}
      {!cancelled && (
        <div className={`next-action ${m.remainingPence > 0 ? "" : "settled"}`}>
          {m.remainingPence > 0 ? (
            side === "planner" ? (
              <>
                <div>
                  <p className="tiny mb-0">Next</p>
                  <p className="mb-0"><strong>Pay the remaining {formatPounds(m.remainingPence)}</strong>{b.balance_due_date ? ` by ${longDate(b.balance_due_date)}` : ""}</p>
                </div>
                <form action={payBalanceAction}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <SubmitButton pendingLabel="Opening payment…">{m.openBalance ? "Continue to payment" : `Pay remaining balance (${formatPounds(m.remainingPence)})`}</SubmitButton>
                </form>
              </>
            ) : (
              <div>
                <p className="tiny mb-0">Next</p>
                <p className="mb-0"><strong>The planner pays the remaining {formatPounds(m.remainingPence)}</strong>{b.balance_due_date ? ` by ${longDate(b.balance_due_date)}` : ""} through Gather. You’ll get an email when the booking is paid in full.</p>
              </div>
            )
          ) : (
            <p className="mb-0"><strong>Nothing left to pay.</strong> The date is blocked in the venue’s calendar.</p>
          )}
        </div>
      )}
      {balanceFailed && side === "planner" && <div className="notice error mt-s mb-0">Your last balance payment didn’t go through{balanceFailed.failure_reason ? ` (${balanceFailed.failure_reason})` : ""}. Nothing was charged and your booking is still confirmed. You can try again.</div>}

      {/* Payment timeline */}
      <h3 className="h-sub mt-m">Payments</h3>
      <dl className="balance-rows pay-timeline">
        <div><dt>Booking total</dt><dd className="num">{formatPounds(b.total_pence)}</dd></div>
        {deposit && <div className="paid"><dt>Deposit paid {deposit.paid_at ? dateTime(deposit.paid_at) : ""}</dt><dd className="num">{formatPounds(deposit.amount_pence)}</dd></div>}
        {balancesPaid.map((p) => <div key={p.id} className="paid"><dt>Balance paid {p.paid_at ? dateTime(p.paid_at) : ""}</dt><dd className="num">{formatPounds(p.amount_pence)}</dd></div>)}
        {!cancelled && (
          <div className={m.remainingPence > 0 ? "due" : "due settled"}><dt>Remaining balance{m.remainingPence > 0 && b.balance_due_date ? ` (due by ${longDate(b.balance_due_date)})` : ""}</dt><dd className="num">{m.remainingPence > 0 ? formatPounds(m.remainingPence) : "£0"}</dd></div>
        )}
      </dl>

      {cancelled && (
        <div className="stack mt-m">
          <p className="mb-0"><strong>Cancelled by {b.cancelled_by === "owner" ? "the venue" : "the planner"}</strong>{b.cancelled_at ? ` on ${dateTime(b.cancelled_at)}` : ""}.{b.retained_pence > 0 ? ` The venue keeps ${formatPounds(b.retained_pence)}.` : ""} The date is free again in the venue’s calendar.</p>
          {m.refunds.length > 0 ? (
            <ul className="refund-list">
              {m.refunds.map((r) => {
                const [tone, label] = REFUND_LABEL[r.status];
                return (
                  <li key={r.id}>
                    <span>{r.kind === "deposit" ? "Deposit" : "Balance"} refund · <span className="num">{formatPounds(r.amount_pence)}</span></span>
                    <StatusPill tone={tone as "grey"}>{label}</StatusPill>
                    {r.status === "failed" && <span className="tiny muted">Gather’s team has been alerted and will sort this out.</span>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="small muted mb-0">No refund is due under the agreed terms.</p>}
        </div>
      )}

      {/* Details folded away */}
      <details className="booking-details mt-m">
        <summary>Cancellation terms and booking details</summary>
        <div className="terms">
          <h3>Cancellation terms</h3>
          <p className="small mb-0">{b.cancellation_terms ? termsForViewer(b.cancellation_terms, side) : "No cancellation terms were agreed for this booking (it was made before terms existed). If the planner cancels, Gather reviews the deposit before anything is kept. If the venue cancels, everything is refunded."}</p>
        </div>
        <dl className="detail-list">
          <div><dt>Booking</dt><dd>{b.reference}</dd></div>
          <div><dt>Quote</dt><dd>{b.quote_reference}</dd></div>
          <div><dt>Venue</dt><dd>{b.listing_name}</dd></div>
          <div><dt>Date</dt><dd>{longDate(b.event_date)}</dd></div>
        </dl>
      </details>

      {!cancelled && (
        <p className="mt-m mb-0"><Link href={`/bookings/${b.id}/cancel`} className="danger-link">Cancel booking</Link></p>
      )}
      {test && <p className="tiny muted mt-s mb-0">Test payments: Stripe test mode, no real money moves.</p>}
    </section>
  );
}
