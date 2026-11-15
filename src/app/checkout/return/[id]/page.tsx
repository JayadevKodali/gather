import type { Metadata } from "next";
import Link from "next/link";
import { BookingPanel } from "@/components/BookingPanel";
import { requirePageRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { longDate } from "@/lib/format";
import { getCheckoutForPlanner } from "@/lib/services/checkout";
import { orNotFound } from "@/lib/services/page-guard";
import { StatusPill } from "@/components/StatusPill";

export const metadata: Metadata = { title: "Payment status" };

/**
 * Where the planner lands after paying. It shows what the SERVER knows — a booking is only
 * "confirmed" once the payment has been verified (the webhook in connected mode).
 */
export default async function ReturnPage({ params, searchParams }: PageProps<"/checkout/return/[id]">) {
  const actor = await requirePageRole("planner");
  const { id } = await params;
  const query = await searchParams;
  const db = await getDb();
  const c = await orNotFound(getCheckoutForPlanner(db, actor, id));
  const back = `/enquiries/${c.enquiry_id}`;

  if (c.kind === "balance") {
    return (
      <div className="wrap" style={{ maxWidth: 680 }}>
        <div className="panel" aria-live="polite">
          {c.status === "paid" ? (
            <><StatusPill tone="green">Payment received</StatusPill><h1 className="mt-s">Balance paid for {c.listing_name}</h1>
              <p>Stripe has confirmed your payment. We’ve emailed you and the venue.</p></>
          ) : c.status === "pending" ? (
            <><StatusPill tone="amber">Waiting for payment confirmation</StatusPill><h1 className="mt-s">{query.cancelled ? "Payment not finished" : "Checking your payment…"}</h1>
              <p>{query.cancelled ? "You left the payment page. Nothing has been charged and your booking is still confirmed. You can pay the balance any time before it’s due." : "We mark a booking paid in full only after the payment provider confirms it. This can take a few seconds."}</p>
              <div className="actions"><Link className="btn" href={`/checkout/return/${id}`}>Refresh status</Link><Link className="btn secondary" href="/bookings">My bookings</Link></div></>
          ) : (
            <><StatusPill tone="red">{c.status === "failed" ? "Payment failed" : "Payment not completed"}</StatusPill><h1 className="mt-s">Your booking is still confirmed</h1>
              <p>{c.failure_reason ?? "The balance payment didn’t complete."} Nothing was charged. You can try again from My bookings.</p></>
          )}
        </div>
        {c.booking_ref_id && <BookingPanel db={db} bookingId={c.booking_ref_id} side="planner" />}
        <p><Link href="/bookings">Back to my bookings</Link></p>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 620 }}>
      <div className="panel" aria-live="polite">
        {c.status === "paid" && c.booking_reference ? (
          <>
            <StatusPill tone="green">Booking confirmed</StatusPill>
            <h1 className="mt-s">You’re booked at {c.listing_name}</h1>
            <table>
              <tbody>
                <tr><th scope="row">Booking reference</th><td><strong>{c.booking_reference}</strong></td></tr>
                <tr><th scope="row">Date</th><td>{longDate(c.event_date)}</td></tr>
                <tr><th scope="row">Quote</th><td>{c.quote_reference}</td></tr>
              </tbody>
            </table>
            {c.booking_ref_id && <BookingPanel db={db} bookingId={c.booking_ref_id} side="planner" />}
            <p className="small muted mt-m">We’ve emailed you and the venue. The date is now blocked for everyone else.</p>
            <div className="actions"><Link className="btn" href={back}>Open the booking</Link><Link className="btn secondary" href="/bookings">All bookings</Link></div>
          </>
        ) : c.status === "pending" ? (
          <>
            <StatusPill tone="amber">Waiting for payment confirmation</StatusPill>
            <h1 className="mt-s">{query.cancelled ? "Payment not finished" : "Checking your payment…"}</h1>
            <p>{query.cancelled
              ? "You left the payment page. Nothing has been charged. The date stays held for you for a short while, so you can go back and finish."
              : "We confirm a booking only after the payment provider tells us it succeeded. This can take a few seconds."}</p>
            <div className="actions"><Link className="btn" href={`/checkout/return/${id}`}>Refresh status</Link><Link className="btn secondary" href={back}>Back to the quote</Link></div>
          </>
        ) : (
          <>
            <StatusPill tone="red">{c.status === "failed" ? "Payment failed" : c.status === "cancelled" ? "Payment cancelled" : "Payment expired"}</StatusPill>
            <h1 className="mt-s">No booking yet</h1>
            <p>{c.failure_reason ?? "The payment didn’t complete."} Nothing was charged and the date is no longer held. You can try again from the quote.</p>
            <Link className="btn" href={back}>Back to the quote</Link>
          </>
        )}
      </div>
    </div>
  );
}
