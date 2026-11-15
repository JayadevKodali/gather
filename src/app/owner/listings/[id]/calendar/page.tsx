import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notices } from "@/components/Notice";
import { requirePageRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { londonToday } from "@/lib/services/briefs";
import { calendarEntries } from "@/lib/services/bookings";
import { getOwnedListing, listOwnerListings } from "@/lib/services/listings";
import { setDaysAction } from "../../../../actions/owner";
import { orNotFound } from "@/lib/services/page-guard";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "Dates and calendar" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

function shiftMonth(month: string, by: number) {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export default async function CalendarPage({ params, searchParams }: PageProps<"/owner/listings/[id]/calendar">) {
  const actor = await requirePageRole("owner");
  const { id } = await params;
  const query = await searchParams;
  const month = typeof query.month === "string" && /^\d{4}-\d{2}$/.test(query.month) ? query.month : londonToday().slice(0, 7);
  const db = await getDb();
  const listing = await orNotFound(getOwnedListing(db, actor, id));
  const listings = await listOwnerListings(db, actor);
  const data = await calendarEntries(db, actor, id, month);
  if (!data) notFound();

  const dayState = new Map(data.days.map((d) => [d.day, d.state]));
  const first = new Date(`${month}-01T12:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first grid
  const daysInMonth = +data.to.slice(8, 10);
  const today = londonToday();
  const monthLabel = first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const openCount = data.days.filter((d) => d.state === "open" && d.day >= today).length;
  const bookedCount = data.bookings.length;

  return (
    <div className="wrap">
      <p className="back-link"><Link href={`/owner/listings/${id}`}><span aria-hidden="true">←</span> Edit {listing.name}</Link></p>
      <div className="page-head">
        <div className="page-head-text">
          <h1>Dates and calendar</h1>
          <p className="page-summary">{listing.name}: {openCount} open date{openCount === 1 ? "" : "s"} and {bookedCount} booking{bookedCount === 1 ? "" : "s"} in {monthLabel}.
            {listings.length > 1 && (
              <span className="small"> Other listings: {listings.filter((l) => l.id !== id).map((l, i) => <span key={l.id}>{i ? ", " : ""}<Link href={`/owner/listings/${l.id}/calendar?month=${month}`}>{l.name}</Link></span>)}</span>
            )}
          </p>
        </div>
      </div>
      <Notices params={query} />
      {!listing.is_published && <div className="notice info">This listing is a draft, so planners can’t see these dates yet.</div>}

      <section className="panel cal-panel" aria-label={`${listing.name}, ${monthLabel}`}>
      <div className="cal-head">
        <nav className="month-nav" aria-label="Month">
          <Link className="btn secondary small icon-btn" href={`?month=${shiftMonth(month, -1)}`} aria-label="Previous month"><span aria-hidden="true">‹</span></Link>
          <h2 className="mb-0 month-label">{monthLabel}</h2>
          <Link className="btn secondary small icon-btn" href={`?month=${shiftMonth(month, 1)}`} aria-label="Next month"><span aria-hidden="true">›</span></Link>
          {month !== today.slice(0, 7) && <Link className="btn quiet small" href={`?month=${today.slice(0, 7)}`}>Today</Link>}
        </nav>
        <ul className="legend" aria-label="Key">
          <li><span className="swatch open" />Open: planners can request it</li>
          <li><span className="swatch blocked" />Blocked</li>
          <li><span className="swatch unset" />Not set: hidden from planners</li>
          <li><span className="swatch booked" />Confirmed booking</li>
          <li><span className="swatch enquiry" />Open enquiry</li>
          <li><span className="swatch today" />Today</li>
        </ul>
      </div>

      <div className="calendar" role="grid" aria-label={`${listing.name}, ${monthLabel}`}>
        {WEEKDAYS.map((d) => <div key={d} className="dow" role="columnheader">{d}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} className="day empty" aria-hidden="true" />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const iso = `${month}-${String(i + 1).padStart(2, "0")}`;
          const state = dayState.get(iso);
          const bookings = data.bookings.filter((b) => b.event_date === iso);
          const enquiries = data.enquiries.filter((e) => e.event_date === iso);
          const past = iso < today;
          const label = bookings.length ? "Booked" : state === "open" ? "Open" : state === "blocked" ? "Blocked" : "Not set";
          const isToday = iso === today;
          return (
            <div key={iso} className={`day ${bookings.length ? "booked" : state ?? "unset"}${isToday ? " today" : ""}${past ? " past" : ""}`} role="gridcell" aria-label={`${iso}: ${label}${isToday ? " (today)" : ""}`} aria-current={isToday ? "date" : undefined}>
              <div className="date"><span className="date-num">{i + 1}</span><span className="tiny">{isToday ? "Today" : label}</span></div>
              {bookings.map((b) => (
                <Link key={b.reference} href={`/enquiries/${b.enquiry_id}`} className="entry booking" title={`${b.planner_name}: ${b.guests} ${b.layout}${b.event_type ? `, ${b.event_type}` : ""} (${b.reference})`}>
                  {b.planner_name.split(" ")[0]} · {b.guests}
                </Link>
              ))}
              {enquiries.map((e) => (
                <Link key={e.id} href={`/enquiries/${e.id}`} className="entry enquiry" title={`Enquiry from ${e.planner_name}: ${e.guests} ${e.layout} (${e.reference})`}>
                  Enquiry · {e.planner_name.split(" ")[0]}
                </Link>
              ))}
              {!past && bookings.length === 0 && (
                <form action={setDaysAction}>
                  <input type="hidden" name="listingId" value={id} /><input type="hidden" name="month" value={month} />
                  <input type="hidden" name="from" value={iso} />
                  <input type="hidden" name="state" value={state === "open" ? "blocked" : "open"} />
                  <SubmitButton className="toggle" aria-label={`${state === "open" ? "Block" : "Open"} ${iso}`} pendingLabel="…">{state === "open" ? "Block" : "Open"}</SubmitButton>
                </form>
              )}
            </div>
          );
        })}
      </div>
      </section>

      <form action={setDaysAction} className="panel mt-l">
        <input type="hidden" name="listingId" value={id} /><input type="hidden" name="month" value={month} />
        <h2>Change a range of dates</h2>
        <div className="grid-3">
          <div><label htmlFor="from">From</label><input id="from" name="from" type="date" min={today} required /></div>
          <div><label htmlFor="to">To</label><input id="to" name="to" type="date" min={today} required /></div>
          <div>
            <label htmlFor="state">Set to</label>
            <select id="state" name="state" defaultValue="open">
              <option value="open">Open</option><option value="blocked">Blocked</option><option value="clear">Not set</option>
            </select>
          </div>
        </div>
        <fieldset className="mt-m">
          <legend>Only on these days</legend>
          <div className="choice-row">
            {WEEKDAYS.map((d, i) => <label key={d} className="choice"><input type="checkbox" name="weekdays" value={WEEKDAY_VALUES[i]} defaultChecked /> {d}</label>)}
          </div>
        </fieldset>
        <SubmitButton pendingLabel="Applying…">Apply to range</SubmitButton>
        <p className="tiny mt-s mb-0">Confirmed bookings always keep their date blocked, whatever you set here.</p>
      </form>
    </div>
  );
}
