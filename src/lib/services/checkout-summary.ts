/**
 * What the payment page shows about the booking being paid for (design pass 3.13): the date and guests,
 * and the venue's cover photo (an uploaded cover first, otherwise the seeded photo). Display only.
 */
import type { Db } from "@/lib/db";
import { longDate } from "@/lib/format";
import { venuePhoto } from "@/lib/venue-images";
import { photoUrl } from "./photos";

export interface CheckoutSummary { summary: string; imagePath: string | null; imageAlt: string }

export async function checkoutSummary(db: Db, listingId: string, enquiryId: string): Promise<CheckoutSummary> {
  const [row] = await db.query<{ slug: string; name: string; event_date: string; guests: number; cover: string | null }>(
    `select l.slug, l.name, e.event_date::text as event_date, e.guests,
       (select id from listing_photos ph where ph.listing_id = l.id order by position, created_at limit 1) as cover
     from listings l join enquiries e on e.id = $2 where l.id = $1`,
    [listingId, enquiryId],
  );
  if (!row) return { summary: "", imagePath: null, imageAlt: "" };
  const seeded = venuePhoto(row.slug);
  const imagePath = row.cover ? photoUrl(row.cover, 960) : seeded?.src ?? null;
  return {
    summary: `${longDate(row.event_date)} · ${row.guests} guest${Number(row.guests) === 1 ? "" : "s"}`,
    imagePath,
    imageAlt: row.cover ? `Photo of ${row.name}` : seeded?.alt ?? "",
  };
}
