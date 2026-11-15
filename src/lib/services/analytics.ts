/**
 * Product analytics events (for Amara's pilot numbers). Stored in our own table.
 * Never record message bodies, brief text, names or emails here — only IDs and counts.
 */
import type { Db } from "@/lib/db";

export const EVENTS = [
  "signup",
  "listing_published",
  "brief_submitted",
  "ai_reader_failed",
  "clarification_answered",
  "matches_shown",
  "no_match",
  "enquiry_sent",
  "venue_replied",
  "quote_sent",
  "checkout_started",
  "payment_failed",
  "booking_confirmed",
  "balance_checkout_started",
  "booking_paid_in_full",
  "booking_cancelled",
] as const;
export type EventName = (typeof EVENTS)[number];

export async function track(db: Db, name: EventName, profileId: string | null, props: Record<string, string | number | boolean | null> = {}) {
  await db.query("insert into analytics_events (name, profile_id, props) values ($1, $2, $3::jsonb)", [name, profileId, JSON.stringify(props)]);
}
