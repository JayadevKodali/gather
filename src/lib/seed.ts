/**
 * Seed data: synthetic accounts, the 32 fixture venues (data/venues.json) and a little sample
 * activity so the admin dashboard and calendars aren't empty. Everything is fictional and
 * marked is_synthetic.
 *
 * The sample booking is made through the real services (enquiry → quote → demo payment →
 * fulfilCheckout), so it obeys exactly the same rules as a booking made in the browser.
 */
import type { Db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { demoPayments } from "@/lib/adapters/payments";
import { expandAvailability, loadFixtureVenues, loadPaymentTestVenues } from "@/lib/fixtures";
import { createBrief, searchBrief, updateBriefFields, getBrief } from "@/lib/services/briefs";
import { createEnquiry, postMessage, sendQuote } from "@/lib/services/enquiries";
import { fulfilCheckout, startCheckout } from "@/lib/services/checkout";
import type { Actor, Role } from "@/lib/services/errors";

/** Shared password for the synthetic demo accounts (demo mode only — documented in README). */
export const DEMO_PASSWORD = "gather-demo-2026";

export const DEMO_ACCOUNTS: { email: string; fullName: string; role: Role }[] = [
  { email: "planner@gather.test", fullName: "Priya Shah", role: "planner" },
  { email: "owner@gather.test", fullName: "Sam Okafor", role: "owner" },
  { email: "admin@gather.test", fullName: "Amara Osei", role: "admin" },
  { email: "maya@gather.test", fullName: "Maya Ellis", role: "planner" },
  { email: "owner2@gather.test", fullName: "Lena Marsh", role: "owner" },
  { email: "owner3@gather.test", fullName: "Tom Adeyemi", role: "owner" },
  { email: "owner4@gather.test", fullName: "Grace Lin", role: "owner" },
];

export async function seedAccountsAndVenues(db: Db, password: string): Promise<Map<string, Actor>> {
  const hash = await hashPassword(password);
  const actors = new Map<string, Actor>();
  for (const a of DEMO_ACCOUNTS) {
    const [row] = await db.query<{ id: string }>(
      `insert into profiles (email, full_name, role, password_hash, is_synthetic, email_verified_at) values ($1,$2,$3,$4,true,now())
       on conflict (email) do update set full_name = excluded.full_name, email_verified_at = coalesce(profiles.email_verified_at, now()) returning id`,
      [a.email, a.fullName, a.role, hash],
    );
    actors.set(a.email, { id: row.id, email: a.email, fullName: a.fullName, role: a.role });
  }

  for (const v of [...loadFixtureVenues(), ...loadPaymentTestVenues()]) {
    const owner = actors.get(v.owner);
    if (!owner) throw new Error(`Fixture ${v.slug} has unknown owner ${v.owner}`);
    await db.transaction(async (tx) => {
      const [listing] = await tx.query<{ id: string }>(
        `insert into listings (slug, owner_id, name, description, borough, neighbourhood, venue_type, suits,
           capacity_standing, capacity_seated, capacity_mixed, pricing_model, price_pence, access_notes, is_published, is_synthetic)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true)
         on conflict (slug) do nothing returning id`,
        [v.slug, owner.id, v.name, v.description, v.borough, v.neighbourhood, v.venueType, v.suits,
         v.capacity.standing, v.capacity.seated, v.capacity.mixed, v.pricingModel, v.pricePence, v.accessNotes, v.published],
      );
      if (!listing) return; // already seeded
      for (const [code, f] of Object.entries(v.facilities)) {
        await tx.query(
          "insert into listing_facilities (listing_id, code, state, charge, price_pence) values ($1,$2,$3,$4,$5)",
          [listing.id, code, f.state, f.charge ?? "included", f.pricePence ?? null],
        );
      }
      const { open, blocked } = expandAvailability(v.availability);
      if (open.length || blocked.length) {
        // One statement per state keeps seeding fast.
        await tx.query(
          "insert into listing_days (listing_id, day, state) select $1, d::date, 'open' from unnest($2::text[]) as d",
          [listing.id, open],
        );
        await tx.query(
          "insert into listing_days (listing_id, day, state) select $1, d::date, 'blocked' from unnest($2::text[]) as d",
          [listing.id, blocked],
        );
      }
    });
  }
  return actors;
}

/** Sample activity: one confirmed booking and one enquiry waiting for a reply. */
async function seedActivity(db: Db, actors: Map<string, Actor>) {
  const maya = actors.get("maya@gather.test")!;
  const sam = actors.get("owner@gather.test")!;
  const [loom] = await db.query<{ id: string }>("select id from listings where slug = 'v01-loom-room'");

  // 1. A confirmed booking on 12 March 2027.
  const briefId = await createBrief(db, maya, "Product launch for 65 standing near Shoreditch on 12 March 2027, need a projector and microphones.");
  const brief = await getBrief(db, maya, briefId);
  await updateBriefFields(db, maya, briefId, { ...brief.confirmed, eventType: "corporate" });
  await searchBrief(db, maya, briefId);
  const enquiryId = await createEnquiry(db, maya, { briefId, listingId: loom.id, extras: [], message: "We'd love the room from 6pm. Two microphones for short speeches." });
  await postMessage(db, sam, enquiryId, "Thanks Maya, 6pm works. Quote to follow.");
  const quote = await sendQuote(db, sam, enquiryId, {
    lines: [{ label: "Venue hire (6pm–11pm)", amountPence: 420_000 }, { label: "Microphones", amountPence: 8_000 }, { label: "Bar staff (2)", amountPence: 24_000 }],
    depositPence: 90_000,
  });
  const checkout = await startCheckout(db, maya, enquiryId, quote.id, demoPayments);
  const [row] = await db.query<{ provider_session_id: string }>("select provider_session_id from checkouts where id = $1", [checkout.checkoutId]);
  await fulfilCheckout(db, { providerSessionId: row.provider_session_id, amountPence: 90_000, currency: "GBP" });

  // 2. An enquiry still waiting for the venue's first reply.
  const brief2 = await createBrief(db, maya, "Team dinner for 36, mixed layout, near Shoreditch on 24 March 2027, around £3,000.");
  await searchBrief(db, maya, brief2);
  await createEnquiry(db, maya, { briefId: brief2, listingId: loom.id, extras: [], message: "Could we do a long table plus a standing area for drinks?" });
}

export async function seedDemo(db: Db) {
  const actors = await seedAccountsAndVenues(db, DEMO_PASSWORD);
  await seedActivity(db, actors);
}

export async function ensureDemoSeed(db: Db) {
  const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from profiles");
  if (n === 0) await seedDemo(db);
}
