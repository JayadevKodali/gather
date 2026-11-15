import type { Metadata } from "next";
import Link from "next/link";
import { cancelBookingAction } from "@/app/actions/enquiry";
import { Notices } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requirePageRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { formatPounds, longDate } from "@/lib/format";
import { termsForViewer } from "@/lib/services/enquiries";
import { cancellationPreview } from "@/lib/services/booking-money";
import { paymentsAreTest } from "@/lib/services/checkout";
import { ServiceError } from "@/lib/services/errors";
import { orNotFound } from "@/lib/services/page-guard";

export const metadata: Metadata = { title: "Cancel booking" };

/** Shows exactly what cancelling would refund and what the venue keeps, before anything happens. */
export default async function CancelBookingPage({ params, searchParams }: PageProps<"/bookings/[id]/cancel">) {
  const actor = await requirePageRole("planner", "owner");
  const { id } = await params;
  const query = await searchParams;
  const db = await getDb();
  let preview;
  try {
    preview = await orNotFound(cancellationPreview(db, actor, id));
  } catch (error) {
    if (error instanceof ServiceError && error.code === "conflict") {
      return (
        <div className="wrap" style={{ maxWidth: 640 }}>
          <div className="panel"><h1>Already cancelled</h1><p>{error.message}</p><Link className="btn" href="/bookings">My bookings</Link></div>
        </div>
      );
    }
    throw error;
  }
  const { booking: b, side, plan, fingerprint } = preview;
  const back = `/enquiries/${b.enquiry_id}`;
  const refundRows = plan.refunds.filter((r) => r.status === "pending");

  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <p className="back-link"><Link href={back}><span aria-hidden="true">←</span> Back to the booking</Link></p>
      <h1>Cancel booking {b.reference}?</h1>
      <p className="page-summary">{b.listing_name}, {longDate(b.event_date)}{side === "owner" ? `, booked by ${b.planner_name}` : ""}. {plan.daysBefore >= 0 ? `The event is ${plan.daysBefore} day${plan.daysBefore === 1 ? "" : "s"} away (London time).` : "The event date has passed."}</p>
      <Notices params={query} />
      <section className="panel stack" aria-labelledby="preview-title">
        <h2 id="preview-title" className="mb-0">What would happen</h2>
        <p className="mb-0">{plan.explanation}</p>
        <div className="cancel-tiles" aria-hidden="true">
          <div className="cancel-tile refund"><span className="tiny">Refund {side === "owner" ? "to the planner" : "to you"}</span><strong className="num">{formatPounds(plan.refundPence)}</strong></div>
          <div className="cancel-tile kept"><span className="tiny">Kept by the venue</span><strong className="num">{formatPounds(plan.retainedPence)}</strong></div>
        </div>
        <dl className="balance-rows" style={{ maxWidth: "none" }}>
          {refundRows.map((r) => <div key={r.checkoutId}><dt>Refund of the {r.kind === "deposit" ? "deposit" : "balance paid"}</dt><dd className="num">{formatPounds(r.amountPence)}</dd></div>)}
          {plan.reviewPence > 0 && <div><dt>Deposit held for review by Gather</dt><dd className="num">{formatPounds(plan.reviewPence)}</dd></div>}
          <div className="due"><dt>Total refund {side === "owner" ? "to the planner" : "to you"}</dt><dd className="num">{formatPounds(plan.refundPence)}</dd></div>
          <div className="due"><dt>Kept by the venue</dt><dd className="num">{formatPounds(plan.retainedPence)}</dd></div>
        </dl>
        <details className="booking-details">
          <summary>Cancellation terms</summary>
          <p className="small mb-0 mt-s">{b.cancellation_terms ? <>Agreed terms: {termsForViewer(b.cancellation_terms, side)}</> : "No cancellation terms were agreed for this booking."}</p>
        </details>
        <p className="small muted mb-0">
          Any balance that hasn’t been paid won’t be collected. The date becomes free in the venue’s calendar.
          {paymentsAreTest() ? " Test payments: no real money moves." : ""}
        </p>
      </section>

      {/* Keeping the booking is the easy choice; confirming sits apart. */}
      <div className="actions mt-m"><Link className="btn" href={back}>Keep the booking</Link></div>
      <form action={cancelBookingAction} className="confirm-box danger-zone mt-l">
        <input type="hidden" name="bookingId" value={b.id} />
        <input type="hidden" name="expected" value={fingerprint} />
        <p className="mb-0"><strong>This can’t be undone.</strong> {plan.refundPence > 0 ? `${formatPounds(plan.refundPence)} is refunded to the card it came from.` : "No refund is due."}</p>
        <SubmitButton className="btn danger solid" pendingLabel="Cancelling…">Confirm cancellation</SubmitButton>
      </form>
    </div>
  );
}
