/**
 * Venue listings: owners create and edit their own; the matcher reads published ones.
 * Every write checks that the signed-in owner owns the listing.
 */
import { z } from "zod";
import type { Db } from "@/lib/db";
import { BOROUGHS } from "@/lib/areas";
import { EVENT_TYPES, FACILITY_CODES, PRICING_MODELS, type FacilityCode, type VenueFacility } from "@/lib/domain";
import type { MatchVenue } from "@/lib/matching/types";
import { venuePhoto } from "@/lib/venue-images";
import { track } from "./analytics";
import { forbidden, invalid, notFound, requireRole, type Actor } from "./errors";

const capacity = z.coerce.number().int().positive().max(5000).nullable();

export const ListingInputSchema = z
  .object({
    name: z.string().trim().min(2, "Give the listing a name").max(80),
    description: z.string().trim().max(1000).default(""),
    borough: z.enum(BOROUGHS, { message: "Choose a London borough" }),
    neighbourhood: z.string().trim().max(60).default(""),
    venueType: z.string().trim().min(2, "Say what kind of space it is").max(60),
    suits: z.array(z.enum(EVENT_TYPES)).default([]),
    capacityStanding: capacity,
    capacitySeated: capacity,
    capacityMixed: capacity,
    pricingModel: z.enum(PRICING_MODELS),
    pricePence: z.number().int().positive("Enter a price above £0").max(100_000_000),
    accessNotes: z.string().trim().max(500).default(""),
    /** Omitted = keep the current state (the edit form saves changes without publishing). */
    published: z.boolean().optional(),
  })
  .refine((v) => v.capacityStanding || v.capacitySeated || v.capacityMixed, {
    message: "Enter at least one capacity (standing, seated or mixed)",
  });
export type ListingInput = z.infer<typeof ListingInputSchema>;

export interface ListingRow {
  id: string;
  slug: string;
  owner_id: string;
  name: string;
  description: string;
  borough: string;
  neighbourhood: string;
  venue_type: string;
  suits: string[];
  capacity_standing: number | null;
  capacity_seated: number | null;
  capacity_mixed: number | null;
  pricing_model: (typeof PRICING_MODELS)[number];
  price_pence: number;
  access_notes: string;
  is_published: boolean;
  is_synthetic: boolean;
  updated_at: Date;
}

export async function getListing(db: Db, id: string): Promise<ListingRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.query<ListingRow>("select * from listings where id = $1", [id]);
  return row ?? null;
}

/** Loads a listing and checks the signed-in owner owns it. */
export async function getOwnedListing(db: Db, actor: Actor | null, id: string): Promise<ListingRow> {
  const owner = requireRole(actor, "owner");
  const listing = await getListing(db, id);
  if (!listing) throw notFound("Listing not found.");
  if (listing.owner_id !== owner.id) throw forbidden("You can only manage your own listings.");
  return listing;
}

export async function listOwnerListings(db: Db, actor: Actor | null) {
  const owner = requireRole(actor, "owner");
  return db.query<ListingRow & { open_days: number; bookings: number; pending: number }>(
    `select l.*,
       (select count(*)::int from listing_days d where d.listing_id = l.id and d.state = 'open' and d.day >= current_date) as open_days,
       (select count(*)::int from bookings b where b.listing_id = l.id and b.status = 'confirmed') as bookings,
       (select count(*)::int from enquiries e where e.listing_id = l.id and e.status in ('awaiting_venue', 'info_requested')) as pending
     from listings l where l.owner_id = $1 order by l.name`,
    [owner.id],
  );
}

export const PUBLISH_NEEDS_PHOTO = "Add at least one photo before publishing. Save the listing as a draft, upload photos, then publish.";

/** Publishing needs a photo: an uploaded one, or the seeded venue's own photo. */
async function assertCanPublish(db: Db, listing: { id: string; slug: string }) {
  if (venuePhoto(listing.slug)) return;
  const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from listing_photos where listing_id = $1", [listing.id]);
  if (n === 0) throw invalid(PUBLISH_NEEDS_PHOTO);
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "listing";
}

export async function createListing(db: Db, actor: Actor | null, input: unknown): Promise<string> {
  const owner = requireRole(actor, "owner");
  const parsed = ListingInputSchema.safeParse(input);
  if (!parsed.success) throw invalid(parsed.error.issues[0].message);
  const v = parsed.data;
  // A brand-new listing has no photos yet, so it always starts as a draft.
  if (v.published) throw invalid(PUBLISH_NEEDS_PHOTO);
  const slug = `${slugify(v.name)}-${Date.now().toString(36)}`;
  const [row] = await db.query<{ id: string }>(
    `insert into listings (slug, owner_id, name, description, borough, neighbourhood, venue_type, suits,
       capacity_standing, capacity_seated, capacity_mixed, pricing_model, price_pence, access_notes, is_published)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
    [slug, owner.id, v.name, v.description, v.borough, v.neighbourhood, v.venueType, v.suits,
     v.capacityStanding, v.capacitySeated, v.capacityMixed, v.pricingModel, v.pricePence, v.accessNotes, false],
  );
  return row.id;
}

export async function updateListing(db: Db, actor: Actor | null, id: string, input: unknown): Promise<void> {
  const listing = await getOwnedListing(db, actor, id);
  const parsed = ListingInputSchema.safeParse(input);
  if (!parsed.success) throw invalid(parsed.error.issues[0].message);
  const v = parsed.data;
  const published = v.published ?? listing.is_published;
  if (published && !listing.is_published) await assertCanPublish(db, listing);
  await db.query(
    `update listings set name=$2, description=$3, borough=$4, neighbourhood=$5, venue_type=$6, suits=$7,
       capacity_standing=$8, capacity_seated=$9, capacity_mixed=$10, pricing_model=$11, price_pence=$12,
       access_notes=$13, is_published=$14, updated_at=now() where id=$1`,
    [id, v.name, v.description, v.borough, v.neighbourhood, v.venueType, v.suits, v.capacityStanding,
     v.capacitySeated, v.capacityMixed, v.pricingModel, v.pricePence, v.accessNotes, published],
  );
  if (published && !listing.is_published) await track(db, "listing_published", listing.owner_id, { listingId: id });
}

export async function setPublished(db: Db, actor: Actor | null, id: string, published: boolean) {
  const listing = await getOwnedListing(db, actor, id);
  if (published && !listing.is_published) await assertCanPublish(db, listing);
  await db.query("update listings set is_published = $2, updated_at = now() where id = $1", [id, published]);
  if (published && !listing.is_published) await track(db, "listing_published", listing.owner_id, { listingId: id });
}

// ---------- Facilities ----------

export const FacilityInputSchema = z.object({
  state: z.enum(["yes", "no", "unknown"]),
  charge: z.enum(["included", "priced", "to_confirm"]),
  pricePence: z.number().int().nonnegative().max(10_000_000).nullable(),
  note: z.string().trim().max(200).default(""),
});

export async function getFacilities(db: Db, listingId: string): Promise<Partial<Record<FacilityCode, VenueFacility>>> {
  const rows = await db.query<{ code: FacilityCode; state: VenueFacility["state"]; charge: VenueFacility["charge"]; price_pence: number | null; note: string }>(
    "select code, state, charge, price_pence, note from listing_facilities where listing_id = $1",
    [listingId],
  );
  return Object.fromEntries(rows.map((r) => [r.code, { state: r.state, charge: r.charge, pricePence: r.price_pence, note: r.note }]));
}

export async function setFacilities(db: Db, actor: Actor | null, id: string, input: Record<string, unknown>) {
  await getOwnedListing(db, actor, id);
  const rows: [FacilityCode, z.infer<typeof FacilityInputSchema>][] = [];
  for (const [code, value] of Object.entries(input)) {
    if (!(FACILITY_CODES as string[]).includes(code)) throw invalid(`Unknown facility ${code}`);
    const parsed = FacilityInputSchema.safeParse(value);
    if (!parsed.success) throw invalid(`${code}: ${parsed.error.issues[0].message}`);
    if (parsed.data.charge === "priced" && parsed.data.pricePence === null) throw invalid("Enter a price for each priced extra.");
    rows.push([code as FacilityCode, parsed.data]);
  }
  await db.transaction(async (tx) => {
    await tx.query("delete from listing_facilities where listing_id = $1", [id]);
    for (const [code, f] of rows) {
      await tx.query(
        "insert into listing_facilities (listing_id, code, state, charge, price_pence, note) values ($1,$2,$3,$4,$5,$6)",
        [id, code, f.state, f.state === "yes" ? f.charge : "included", f.state === "yes" && f.charge === "priced" ? f.pricePence : null, f.note],
      );
    }
    await tx.query("update listings set updated_at = now() where id = $1", [id]);
  });
}

// ---------- Availability (day level) ----------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function getDays(db: Db, listingId: string, from: string, to: string) {
  return db.query<{ day: string; state: "open" | "blocked" }>(
    "select day, state from listing_days where listing_id = $1 and day between $2 and $3 order by day",
    [listingId, from, to],
  );
}

/** Mark a run of days open or blocked, optionally only on some weekdays (0 = Sunday). */
export async function setDays(
  db: Db,
  actor: Actor | null,
  id: string,
  input: { from: string; to: string; state: "open" | "blocked" | "clear"; weekdays?: number[] },
): Promise<number> {
  await getOwnedListing(db, actor, id);
  if (!isoDate.safeParse(input.from).success || !isoDate.safeParse(input.to).success) throw invalid("Choose a start and end date.");
  if (input.to < input.from) throw invalid("The end date is before the start date.");
  const weekdays = input.weekdays?.length ? input.weekdays : [0, 1, 2, 3, 4, 5, 6];
  const days: string[] = [];
  for (let d = new Date(`${input.from}T12:00:00Z`); d <= new Date(`${input.to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (weekdays.includes(d.getUTCDay())) days.push(d.toISOString().slice(0, 10));
    if (days.length > 400) throw invalid("Choose a range of up to about a year.");
  }
  await db.transaction(async (tx) => {
    for (const day of days) {
      if (input.state === "clear") await tx.query("delete from listing_days where listing_id = $1 and day = $2", [id, day]);
      else {
        await tx.query(
          `insert into listing_days (listing_id, day, state) values ($1, $2, $3)
           on conflict (listing_id, day) do update set state = excluded.state`,
          [id, day, input.state],
        );
      }
    }
  });
  return days.length;
}

// ---------- For the matcher ----------

/** Every published listing in the shape the matcher needs, with fresh availability. */
export async function loadMatchVenues(db: Db, onlyIds?: string[]): Promise<MatchVenue[]> {
  const listings = await db.query<ListingRow>(
    `select * from listings where is_published ${onlyIds ? "and id = any($1::uuid[])" : ""}`,
    onlyIds ? [onlyIds] : [],
  );
  if (listings.length === 0) return [];
  const ids = listings.map((l) => l.id);
  const facilities = await db.query<{ listing_id: string; code: FacilityCode; state: VenueFacility["state"]; charge: VenueFacility["charge"]; price_pence: number | null }>(
    "select listing_id, code, state, charge, price_pence from listing_facilities where listing_id = any($1::uuid[])",
    [ids],
  );
  const open = await db.query<{ listing_id: string; day: string }>(
    "select listing_id, day from listing_days where state = 'open' and day >= current_date and listing_id = any($1::uuid[])",
    [ids],
  );
  const taken = await db.query<{ listing_id: string; day: string }>(
    `select listing_id, event_date as day from bookings where status = 'confirmed' and listing_id = any($1::uuid[])
     union select listing_id, event_date from checkouts where status = 'pending' and kind = 'deposit' and expires_at > now() and listing_id = any($1::uuid[])`,
    [ids],
  );
  const group = <T extends { listing_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const r of rows) map.set(r.listing_id, [...(map.get(r.listing_id) ?? []), r]);
    return map;
  };
  const f = group(facilities);
  const o = group(open);
  const t = group(taken);
  return listings.map((l) => ({
    id: l.id,
    slug: l.slug,
    name: l.name,
    borough: l.borough,
    neighbourhood: l.neighbourhood,
    venueType: l.venue_type,
    suits: l.suits as MatchVenue["suits"],
    capacity: { standing: l.capacity_standing, seated: l.capacity_seated, mixed: l.capacity_mixed },
    pricingModel: l.pricing_model,
    pricePence: l.price_pence,
    facilities: Object.fromEntries((f.get(l.id) ?? []).map((r) => [r.code, { state: r.state, charge: r.charge, pricePence: r.price_pence }])),
    published: l.is_published,
    openDates: new Set((o.get(l.id) ?? []).map((r) => r.day)),
    takenDates: new Set((t.get(l.id) ?? []).map((r) => r.day)),
  }));
}
