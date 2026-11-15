/** Booking history for planners and owners (each sees only their own). */
import type { Db } from "@/lib/db";
import { requireRole, type Actor } from "./errors";

export type HistorySort = "date-asc" | "date-desc" | "total-asc" | "total-desc";
const ORDER: Record<HistorySort, string> = {
  "date-asc": "b.event_date asc, b.reference",
  "date-desc": "b.event_date desc, b.reference",
  "total-asc": "b.total_pence asc, b.reference",
  "total-desc": "b.total_pence desc, b.reference",
};

export interface BookingListRow {
  id: string;
  reference: string;
  enquiry_id: string;
  event_date: string;
  total_pence: number;
  deposit_pence: number;
  confirmed_at: Date;
  listing_id: string;
  listing_name: string;
  listing_slug: string;
  planner_name: string;
  quote_reference: string;
  guests: number;
  layout: string;
  event_type: string | null;
  status: "confirmed" | "cancelled";
  paid_in_full_at: Date | null;
  paid_pence: number;
  balance_due_date: string | null;
  open_refunds: number;
  /** Refunds Stripe (or the demo) has confirmed, and refunds still in progress, in pence. */
  refunded_pence: number;
  refunding_pence: number;
}

export async function listBookings(db: Db, actor: Actor | null, opts: { sort?: string; listingId?: string } = {}) {
  const user = requireRole(actor, "planner", "owner");
  const sort = (Object.keys(ORDER) as HistorySort[]).includes(opts.sort as HistorySort) ? (opts.sort as HistorySort) : "date-asc";
  const scope = user.role === "planner" ? "b.planner_id = $1" : "l.owner_id = $1";
  const listingFilter = opts.listingId && /^[0-9a-f-]{36}$/i.test(opts.listingId) ? opts.listingId : null;
  return db.query<BookingListRow>(
    `select b.id, b.reference, b.enquiry_id, b.event_date, b.total_pence, b.deposit_pence, b.confirmed_at, b.listing_id,
       l.name as listing_name, l.slug as listing_slug, p.full_name as planner_name, q.reference as quote_reference, e.guests, e.layout,
       e.brief_snapshot->>'eventType' as event_type, b.status, b.paid_in_full_at, b.balance_due_date::text as balance_due_date,
       (select coalesce(sum(c.amount_pence), 0)::int from checkouts c where c.status = 'paid' and (c.booking_id = b.id or c.id = b.checkout_id)) as paid_pence,
       (select count(*)::int from refunds r where r.booking_id = b.id and r.status in ('pending', 'review', 'failed')) as open_refunds,
       (select coalesce(sum(r.amount_pence), 0)::int from refunds r where r.booking_id = b.id and r.status = 'succeeded') as refunded_pence,
       (select coalesce(sum(r.amount_pence), 0)::int from refunds r where r.booking_id = b.id and r.status in ('pending', 'failed')) as refunding_pence
     from bookings b join listings l on l.id = b.listing_id join profiles p on p.id = b.planner_id
       join quotes q on q.id = b.quote_id join enquiries e on e.id = b.enquiry_id
     where ${scope} and ($2::uuid is null or b.listing_id = $2::uuid)
     order by ${ORDER[sort]}`,
    [user.id, listingFilter],
  );
}

/** Calendar entries for one owned listing in one month: bookings, open enquiries and blocked days. */
export async function calendarEntries(db: Db, actor: Actor | null, listingId: string, month: string) {
  const owner = requireRole(actor, "owner");
  const from = `${month}-01`;
  const to = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);
  const [own] = await db.query("select id from listings where id = $1 and owner_id = $2", [listingId, owner.id]);
  if (!own) return null;
  const days = await db.query<{ day: string; state: "open" | "blocked" }>(
    "select day, state from listing_days where listing_id = $1 and day between $2 and $3",
    [listingId, from, to],
  );
  const bookings = await db.query<{ event_date: string; reference: string; enquiry_id: string; planner_name: string; guests: number; layout: string; event_type: string | null }>(
    `select b.event_date, b.reference, b.enquiry_id, p.full_name as planner_name, e.guests, e.layout, e.brief_snapshot->>'eventType' as event_type
     from bookings b join enquiries e on e.id = b.enquiry_id join profiles p on p.id = b.planner_id
     where b.listing_id = $1 and b.event_date between $2 and $3 and b.status = 'confirmed'`,
    [listingId, from, to],
  );
  const enquiries = await db.query<{ event_date: string; reference: string; id: string; planner_name: string; guests: number; layout: string; status: string }>(
    `select e.event_date, e.reference, e.id, p.full_name as planner_name, e.guests, e.layout, e.status
     from enquiries e join profiles p on p.id = e.planner_id
     where e.listing_id = $1 and e.event_date between $2 and $3 and e.status in ('awaiting_venue', 'info_requested', 'quoted')`,
    [listingId, from, to],
  );
  return { from, to, days, bookings, enquiries };
}
