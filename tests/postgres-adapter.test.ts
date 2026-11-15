/**
 * Runs the CONNECTED-mode database adapter (postgres.js, the driver used with Supabase) over the
 * real Postgres wire protocol, against PGlite's socket server. Proves the migrations, the seed and
 * a full booking work through the production driver, not just through PGlite's in-process API.
 * (One connection, because PGlite is a single Postgres session.)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createPostgresDb, migrate, type Db } from "@/lib/db";
import { demoPayments } from "@/lib/adapters/payments";
import { seedAccountsAndVenues } from "@/lib/seed";
import { createBrief, getBrief, searchBrief, updateBriefFields } from "@/lib/services/briefs";
import { fulfilCheckout, startCheckout } from "@/lib/services/checkout";
import { createEnquiry, sendQuote } from "@/lib/services/enquiries";
import { adminMetrics } from "@/lib/services/admin";
import type { Actor } from "@/lib/services/errors";

let server: PGLiteSocketServer;
let pg: PGlite;
let db: Db;
let actors: Map<string, Actor>;
const PORT = 55432;

beforeAll(async () => {
  pg = new PGlite();
  await pg.waitReady;
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1" });
  await server.start();
  db = await createPostgresDb(`postgres://postgres@127.0.0.1:${PORT}/postgres`, 1);
  expect(await migrate(db)).toEqual(["0001_schema.sql", "0002_rls.sql", "0003_stage2.sql", "0004_polish.sql", "0005_payments.sql", "0006_auth.sql"]);
  actors = await seedAccountsAndVenues(db, "adapter-test-pw");
});

afterAll(async () => {
  await server?.stop();
  await pg?.close();
});

describe("postgres.js adapter over the wire", () => {
  it("seeded the 32 venues plus the payment-testing room, with facilities and day-level availability", async () => {
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from listings where slug <> 'v90-gather-test-room'");
    expect(n).toBe(32);
    const [test] = await db.query<{ first: string; last: string }>(
      "select min(day)::text as first, max(day)::text as last from listing_days d join listings l on l.id = d.listing_id where l.slug = 'v90-gather-test-room'",
    );
    expect(test).toEqual({ first: "2027-07-01", last: "2027-12-31" });
    const [{ overlap }] = await db.query<{ overlap: number }>(
      "select count(*)::int as overlap from listing_days d join listings l on l.id = d.listing_id where l.slug <> 'v90-gather-test-room' and d.day >= '2027-07-01'",
    );
    expect(overlap).toBe(0); // paying for the test room can never take a date a main venue offers
    const [{ day }] = await db.query<{ day: string }>("select day from listing_days order by day limit 1");
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/); // dates come back as plain strings, not Date objects
  });

  it("runs the whole brief → enquiry → quote → deposit → booking path", async () => {
    const planner = actors.get("planner@gather.test")!;
    const owner = actors.get("owner@gather.test")!;
    const briefId = await createBrief(db, planner, "80 people standing near Shoreditch on 26 March 2027, under £6k, needs AV");
    const brief = await getBrief(db, planner, briefId);
    await updateBriefFields(db, planner, briefId, brief.confirmed);
    const outcome = await searchBrief(db, planner, briefId);
    expect(outcome.shortlist[0]?.venue.slug).toBe("v01-loom-room");

    const enquiryId = await createEnquiry(db, planner, { briefId, listingId: outcome.shortlist[0].venue.id, extras: [], message: "Hi" });
    const quote = await sendQuote(db, owner, enquiryId, { lines: [{ label: "Hire", amountPence: 420_000 }], depositPence: 80_000 });
    const { checkoutId } = await startCheckout(db, planner, enquiryId, quote.id, demoPayments);
    const [{ provider_session_id }] = await db.query<{ provider_session_id: string }>("select provider_session_id from checkouts where id = $1", [checkoutId]);
    const event = { providerSessionId: provider_session_id, amountPence: 80_000, currency: "GBP" };
    const first = await fulfilCheckout(db, event);
    const again = await fulfilCheckout(db, event);
    expect(first.status).toBe("booked");
    expect(again.status === "booked" && first.status === "booked" && again.bookingId === first.bookingId).toBe(true);

    const metrics = await adminMetrics(db, actors.get("admin@gather.test")!, "all");
    expect(metrics.bookings.count).toBe(1);
    expect(metrics.briefs.matched).toBe(1);
  });
});
