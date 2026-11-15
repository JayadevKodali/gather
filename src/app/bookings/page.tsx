import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { payBalanceAction } from "../actions/enquiry";
import { requirePageRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/domain";
import { formatPounds, longDate } from "@/lib/format";
import { listBookings } from "@/lib/services/bookings";
import { listOwnerListings } from "@/lib/services/listings";
import { StatusPill } from "@/components/StatusPill";
import { PageHeader } from "@/components/PageHeader";
import { coverPhotoIds, photoUrl } from "@/lib/services/photos";
import { venuePhoto } from "@/lib/venue-images";

export const metadata: Metadata = { title: "Bookings" };

const SORTS = [["date-asc", "Event date, soonest first"], ["date-desc", "Event date, latest first"], ["total-desc", "Total, highest first"], ["total-asc", "Total, lowest first"]] as const;

export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const actor = await requirePageRole("planner", "owner");
  const params = await searchParams;
  const sort = typeof params.sort === "string" ? params.sort : "date-asc";
  const listing = typeof params.listing === "string" ? params.listing : "";
  const db = await getDb();
  const rows = await listBookings(db, actor, { sort, listingId: listing || undefined });
  const listings = actor.role === "owner" ? await listOwnerListings(db, actor) : [];
  const covers = await coverPhotoIds(db, [...new Set(rows.map((r) => r.listing_id))]);
  const photoFor = (b: (typeof rows)[number]) => {
    const up = covers.get(b.listing_id);
    if (up) return { src: photoUrl(up, 480), alt: `Photo of ${b.listing_name}` };
    return venuePhoto(b.listing_slug);
  };
  const upcoming = rows.filter((b) => b.status === "confirmed").length;
  return (
    <div className="wrap">
      <PageHeader
        title="Bookings"
        summary={rows.length === 0 ? undefined : `${upcoming} confirmed${rows.length > upcoming ? ` · ${rows.length - upcoming} cancelled` : ""}`}
        action={
          <form className="row filter-row">
            {actor.role === "owner" && (
              <>
                <label htmlFor="listing" className="sr-only">Venue</label>
                <select id="listing" name="listing" defaultValue={listing} style={{ width: 220 }}>
                  <option value="">All my venues</option>
                  {listings.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </>
            )}
            <label htmlFor="sort" className="sr-only">Sort</label>
            <select id="sort" name="sort" defaultValue={sort} style={{ width: 230 }}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="btn secondary" type="submit">Apply</button>
          </form>
        }
      />
      {rows.length === 0 ? (
        <div className="panel"><p className="mb-0">No confirmed bookings yet. A booking appears here once the deposit is paid.{actor.role === "planner" && <> <Link href="/plan">Find a venue</Link>.</>}</p></div>
      ) : (
        <ul className="booking-cards stagger">
          {rows.map((b) => {
            const d = new Date(`${b.event_date}T12:00:00Z`);
            const photo = photoFor(b);
            const pct = b.total_pence > 0 ? Math.min(100, Math.round((b.paid_pence / b.total_pence) * 100)) : 0;
            const remaining = Math.max(0, b.total_pence - b.paid_pence);
            return (
              <li key={b.id} className={`card booking-card ${b.status === "cancelled" ? "is-cancelled" : ""}`}>
                <div className="booking-card-media">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.src} alt="" loading="lazy" />
                  ) : <span className="booking-card-fallback" aria-hidden="true" />}
                  <time className="date-block" dateTime={b.event_date}>
                    <span className="date-day">{d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" })}</span>
                    <span className="date-month">{d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}</span>
                  </time>
                </div>
                <div className="booking-card-body">
                  <div className="spread">
                    <h2 className="mb-0"><Link href={`/enquiries/${b.enquiry_id}`}>{actor.role === "planner" ? b.listing_name : b.planner_name}</Link></h2>
                    <StatusPill tone={b.status === "cancelled" ? "red" : b.paid_in_full_at ? "green" : "amber"}>
                      {b.status === "cancelled" ? `Cancelled${b.open_refunds ? " · refund in progress" : ""}` : b.paid_in_full_at ? "Paid in full" : "Balance due"} · {b.reference}
                    </StatusPill>
                  </div>
                  <p className="mb-0 mt-s">{longDate(b.event_date)} · {b.guests} {b.layout}{b.event_type ? ` · ${EVENT_TYPE_LABELS[b.event_type as EventType]}` : ""}{actor.role === "owner" ? ` · ${b.listing_name}` : ""}</p>
                  <p className="small muted mb-0">Quote {b.quote_reference}</p>
                  {b.status === "confirmed" && (
                    <div className="paid-meter" role="img" aria-label={`${formatPounds(b.paid_pence)} of ${formatPounds(b.total_pence)} paid`}>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <dl className="balance-rows compact">
                    <div><dt>Booking total</dt><dd className="num">{formatPounds(b.total_pence)}</dd></div>
                    <div><dt>Paid through Gather</dt><dd className="num">{formatPounds(b.paid_pence)}</dd></div>
                    {b.refunded_pence > 0 && <div><dt>Refunded</dt><dd className="num">{formatPounds(b.refunded_pence)}</dd></div>}
                    {b.refunding_pence > 0 && <div><dt>Refund in progress</dt><dd className="num">{formatPounds(b.refunding_pence)}</dd></div>}
                    {b.status === "confirmed" && <div className="due"><dt>Remaining{remaining > 0 && b.balance_due_date ? ` (due by ${longDate(b.balance_due_date)})` : ""}</dt><dd className="num">{formatPounds(remaining)}</dd></div>}
                  </dl>
                  <div className="actions mt-s">
                    {actor.role === "planner" && b.status === "confirmed" && remaining > 0 && (
                      <form action={payBalanceAction}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <SubmitButton className="btn small" pendingLabel="Opening payment…">Pay remaining balance</SubmitButton>
                      </form>
                    )}
                    <Link className="btn small secondary" href={`/enquiries/${b.enquiry_id}`}>View booking</Link>
                    {b.status === "confirmed" && <Link className="btn small quiet" href={`/bookings/${b.id}/cancel`}>Cancel booking</Link>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
