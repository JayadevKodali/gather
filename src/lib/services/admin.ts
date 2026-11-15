/**
 * Amara's admin dashboard: read-only aggregate numbers. No private messages, no card details.
 *
 * Counting rules (so numbers can't be inflated by repeat actions):
 *  - Sign-ups: distinct planner/owner accounts created in the period (sign-ins don't count).
 *  - Matched briefs: briefs whose FIRST eligible shortlist appeared in the period (re-running
 *    the same search doesn't add to it). Search events are counted separately.
 *  - Enquiry → booking conversion: of enquiries created in the period, how many have a confirmed
 *    booking now. A booking that was later cancelled doesn't count as a success.
 *    One brief can create several enquiries.
 *  - Bookings: only confirmed bookings are counted and listed; cancelled ones are a separate figure.
 *  - Current listings are a snapshot "as of now", not filtered by period.
 */
import type { Db } from "@/lib/db";
import { requireRole, type Actor } from "./errors";

export type Period = "7" | "30" | "all";
export const PERIOD_LABELS: Record<Period, string> = { "7": "Last 7 days", "30": "Last 30 days", all: "All time" };

/** Middle value of a sorted list (average of the two middle values if the count is even). */
export function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function adminMetrics(db: Db, actor: Actor | null, period: Period) {
  requireRole(actor, "admin");
  const since = period === "all" ? "-infinity" : new Date(Date.now() - Number(period) * 86_400_000).toISOString();
  const one = async <T>(sql: string, params: unknown[] = [since]) => (await db.query<T>(sql, params))[0];

  const signUps = await one<{ planners: number; owners: number }>(
    `select count(*) filter (where role = 'planner')::int as planners, count(*) filter (where role = 'owner')::int as owners
     from profiles where created_at >= $1::timestamptz`,
  );
  const briefs = await one<{ total: number; matched: number; no_match: number; awaiting: number }>(
    `select count(*)::int as total,
       count(*) filter (where first_matched_at is not null)::int as matched,
       count(*) filter (where status = 'searched' and first_matched_at is null)::int as no_match,
       count(*) filter (where status in ('needs_info', 'ready'))::int as awaiting
     from briefs where created_at >= $1::timestamptz`,
  );
  // Which reader handled each brief, so Amara can see whether OpenAI actually ran.
  const reader = await one<{ openai: number; fallback: number; rules: number; last_error: string | null; last_error_at: Date | null }>(
    `select count(*) filter (where extractor like 'openai:%')::int as openai,
       count(*) filter (where extractor = 'rules-fallback')::int as fallback,
       count(*) filter (where extractor = 'rules')::int as rules,
       (select extractor_error from briefs where extractor_error is not null and created_at >= $1::timestamptz order by created_at desc limit 1) as last_error,
       (select created_at from briefs where extractor_error is not null and created_at >= $1::timestamptz order by created_at desc limit 1) as last_error_at
     from briefs where created_at >= $1::timestamptz`,
  );
  const searches = await one<{ n: number }>("select count(*)::int as n from search_events where created_at >= $1::timestamptz");
  const enquiries = await one<{ total: number; quoted: number; booked: number; awaiting_first_reply: number }>(
    `select count(*)::int as total,
       count(*) filter (where exists (select 1 from quotes q where q.enquiry_id = e.id))::int as quoted,
       count(*) filter (where exists (select 1 from bookings b where b.enquiry_id = e.id and b.status = 'confirmed'))::int as booked,
       count(*) filter (where first_reply_at is null and status = 'awaiting_venue')::int as awaiting_first_reply
     from enquiries e where created_at >= $1::timestamptz`,
  );
  const bookings = await one<{ count: number; value: number; deposits: number; cancelled: number }>(
    `select count(*) filter (where status = 'confirmed')::int as count,
       coalesce(sum(total_pence) filter (where status = 'confirmed'), 0)::int as value,
       coalesce(sum(deposit_pence) filter (where status = 'confirmed'), 0)::int as deposits,
       count(*) filter (where status = 'cancelled')::int as cancelled
     from bookings where confirmed_at >= $1::timestamptz`,
  );
  const replyTimes = await db.query<{ hours: number }>(
    `select extract(epoch from (first_reply_at - created_at)) / 3600.0 as hours from enquiries
     where first_reply_at is not null and created_at >= $1::timestamptz order by 1`,
    [since],
  );
  const medianReplyHours = median(replyTimes.map((r) => Number(r.hours)));
  const listings = await one<{ published: number; drafts: number; total: number }>(
    `select count(*) filter (where is_published)::int as published, count(*) filter (where not is_published)::int as drafts, count(*)::int as total from listings`,
    [],
  );

  // Needs attention (actionable lists)
  const draftListings = await db.query<{ id: string; name: string; owner: string; updated_at: Date }>(
    `select l.id, l.name, p.full_name as owner, l.updated_at from listings l join profiles p on p.id = l.owner_id
     where not l.is_published order by l.updated_at desc limit 10`,
  );
  const waiting = await db.query<{ id: string; reference: string; listing: string; created_at: Date; hours: number }>(
    `select e.id, e.reference, l.name as listing, e.created_at, extract(epoch from (now() - e.created_at)) / 3600.0 as hours
     from enquiries e join listings l on l.id = e.listing_id
     where e.first_reply_at is null and e.status = 'awaiting_venue' order by e.created_at limit 10`,
  );
  const unmatched = await db.query<{ id: string; created_at: Date; event_type: string | null; area: string | null; guests: number | null }>(
    `select id, created_at, confirmed->>'eventType' as event_type, confirmed->>'areaText' as area, (confirmed->>'guests')::int as guests
     from briefs where status = 'searched' and first_matched_at is null order by created_at desc limit 10`,
  );
  const contacted = await db.query<{ kind: string; target_id: string; sent_at: Date }>(
    `select distinct on (kind, target_id) kind, target_id, sent_at from admin_contacts
     where status in ('sent','logged','skipped') order by kind, target_id, sent_at desc`,
  );
  const lastContact = Object.fromEntries(contacted.map((c) => [`${c.kind}:${c.target_id}`, c.sent_at]));
  const recentSignUps = await db.query<{ full_name: string; role: string; created_at: Date; is_synthetic: boolean }>(
    `select full_name, role, created_at, is_synthetic from profiles where role <> 'admin' and created_at >= $1::timestamptz order by created_at desc limit 8`,
    [since],
  );
  const recentBriefs = await db.query<{ created_at: Date; event_type: string | null; area: string | null; status: string; matched: boolean }>(
    `select created_at, confirmed->>'eventType' as event_type, confirmed->>'areaText' as area, status, first_matched_at is not null as matched
     from briefs where created_at >= $1::timestamptz order by created_at desc limit 8`,
    [since],
  );
  const recentBookings = await db.query<{ reference: string; listing: string; event_date: string; total_pence: number; deposit_pence: number; provider: string }>(
    `select b.reference, l.name as listing, b.event_date, b.total_pence, b.deposit_pence, c.provider
     from bookings b join listings l on l.id = b.listing_id join checkouts c on c.id = b.checkout_id
     where b.confirmed_at >= $1::timestamptz and b.status = 'confirmed' order by b.confirmed_at desc limit 8`,
    [since],
  );

  return {
    period,
    signUps,
    briefs: { ...briefs, searches: searches.n },
    reader,
    enquiries,
    bookings,
    funnel: [
      { label: "Briefs", value: briefs.total },
      { label: "Briefs with a match", value: briefs.matched },
      { label: "Enquiries", value: enquiries.total },
      { label: "Quoted enquiries", value: enquiries.quoted },
      { label: "Confirmed bookings", value: enquiries.booked },
    ],
    pilot: {
      publishedListings: listings.published, // proxy for "ready" — labelled as such in the UI
      totalListings: listings.total,
      medianReplyHours,
      replySample: replyTimes.length,
      conversion: { numerator: enquiries.booked, denominator: enquiries.total },
    },
    attention: { draftListings, waiting, unmatched, lastContact },
    recent: { signUps: recentSignUps, briefs: recentBriefs, bookings: recentBookings },
  };
}
