/**
 * Server rules tested against a real (in-memory) Postgres with the real migrations.
 * Covers the brief's "critical tests": roles, cross-account access, quote validation,
 * stale quotes, concurrent checkouts, duplicate payment events, declines and the cap re-check.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/lib/config";
import { FACILITY_CODES } from "@/lib/domain";
import { createPgliteDb, migrate, type Db } from "@/lib/db";
import { demoPayments } from "@/lib/adapters/payments";
import { seedAccountsAndVenues } from "@/lib/seed";
import { signIn, signUp } from "@/lib/services/accounts";
import { adminMetrics } from "@/lib/services/admin";
import { createBrief, getBrief, searchBrief, updateBriefFields } from "@/lib/services/briefs";
import { failCheckout, fulfilCheckout, startCheckout } from "@/lib/services/checkout";
import { createEnquiry, getEnquiryThread, postMessage, sendQuote } from "@/lib/services/enquiries";
import type { Actor } from "@/lib/services/errors";
import { createListing, setDays, updateListing } from "@/lib/services/listings";

let db: Db;
let actors: Map<string, Actor>;
const A = (email: string) => actors.get(email)!;
let loomId: string;

beforeAll(async () => {
  db = await createPgliteDb(); // in memory
  await migrate(db);
  actors = await seedAccountsAndVenues(db, "test-password-123");
  [{ id: loomId }] = await db.query<{ id: string }>("select id from listings where slug = 'v01-loom-room'");
});

/** A confirmed brief for the Loom Room on a given date, ready to enquire. */
async function plannerBrief(planner: Actor, date: string, extra: Record<string, unknown> = {}) {
  const id = await createBrief(db, planner, `Drinks for 60 standing in Shoreditch on ${date}`);
  const brief = await getBrief(db, planner, id);
  await updateBriefFields(db, planner, id, { ...brief.confirmed, ...extra });
  return id;
}

async function quotedEnquiry(planner: Actor, date: string, totalPence = 400_000, depositPence = 80_000) {
  const briefId = await plannerBrief(planner, date);
  const enquiryId = await createEnquiry(db, planner, { briefId, listingId: loomId, extras: [], message: "Hello" });
  const quote = await sendQuote(db, A("owner@gather.test"), enquiryId, { lines: [{ label: "Hire", amountPence: totalPence }], depositPence });
  return { briefId, enquiryId, quote };
}

const sessionFor = async (checkoutId: string) =>
  (await db.query<{ provider_session_id: string }>("select provider_session_id from checkouts where id = $1", [checkoutId]))[0].provider_session_id;

describe("accounts and roles", () => {
  it("public sign-up offers planner and owner only — never admin", async () => {
    await expect(signUp(db, { fullName: "Eve", email: "eve@x.test", password: "password1", role: "admin" })).rejects.toThrow(/planner or venue owner/);
    const created = await signUp(db, { fullName: "New Planner", email: "new@x.test", password: "a long enough passphrase", role: "planner" });
    expect(created.profileId).toBeTruthy();
  });

  it("rejects a wrong password with a generic message", async () => {
    await expect(signIn(db, "planner@gather.test", "nope")).rejects.toThrow(/don't match/);
    expect((await signIn(db, "planner@gather.test", "test-password-123")).role).toBe("planner");
  });

  it("a planner can't create a listing; an owner can't edit someone else's", async () => {
    const input = { name: "X", venueType: "Room", borough: "Hackney", pricingModel: "hire_fee", pricePence: 1000, capacityStanding: 10, capacitySeated: null, capacityMixed: null, published: false };
    await expect(createListing(db, A("planner@gather.test"), input)).rejects.toThrow(/owner/);
    await expect(updateListing(db, A("owner2@gather.test"), loomId, input)).rejects.toThrow(/your own listings/);
    await expect(setDays(db, A("owner2@gather.test"), loomId, { from: "2027-05-01", to: "2027-05-02", state: "blocked" })).rejects.toThrow(/your own listings/);
  });

  it("only admins can read the dashboard", async () => {
    await expect(adminMetrics(db, A("planner@gather.test"), "all")).rejects.toThrow(/admin/);
    await expect(adminMetrics(db, A("admin@gather.test"), "all")).resolves.toBeTruthy();
  });
});

describe("cross-account access", () => {
  it("planners can't read each other's briefs; outsiders and admins can't open an enquiry", async () => {
    const { briefId, enquiryId } = await quotedEnquiry(A("planner@gather.test"), "2027-05-04");
    await expect(getBrief(db, A("maya@gather.test"), briefId)).rejects.toThrow(/another planner/);
    await expect(getEnquiryThread(db, A("maya@gather.test"), enquiryId)).rejects.toThrow(/Only the planner and the venue owner/);
    await expect(getEnquiryThread(db, A("owner2@gather.test"), enquiryId)).rejects.toThrow(/Only the planner and the venue owner/);
    await expect(getEnquiryThread(db, A("admin@gather.test"), enquiryId)).rejects.toThrow();
    await expect(getEnquiryThread(db, A("owner@gather.test"), enquiryId)).resolves.toBeTruthy();
  });
});

describe("quotes", () => {
  it("rejects a deposit of zero or more than the total", async () => {
    const briefId = await plannerBrief(A("planner@gather.test"), "2027-05-05");
    const enquiryId = await createEnquiry(db, A("planner@gather.test"), { briefId, listingId: loomId, extras: [], message: "" });
    const owner = A("owner@gather.test");
    await expect(sendQuote(db, owner, enquiryId, { lines: [{ label: "Hire", amountPence: 1000 }], depositPence: 0 })).rejects.toThrow(/more than £0/);
    await expect(sendQuote(db, owner, enquiryId, { lines: [{ label: "Hire", amountPence: 1000 }], depositPence: 2000 })).rejects.toThrow(/more than the total/);
    await expect(sendQuote(db, A("planner@gather.test"), enquiryId, { lines: [{ label: "Hire", amountPence: 1000 }], depositPence: 100 })).rejects.toThrow(/Only the venue/);
  });

  it("a revision gets a new reference; the replaced quote can't be paid", async () => {
    const planner = A("planner@gather.test");
    const { enquiryId, quote: v1 } = await quotedEnquiry(planner, "2027-05-06");
    const v2 = await sendQuote(db, A("owner@gather.test"), enquiryId, { lines: [{ label: "Hire", amountPence: 380_000 }], depositPence: 70_000 });
    expect(v2.reference).not.toBe(v1.reference);
    expect(v2.version).toBe(2);
    await expect(startCheckout(db, planner, enquiryId, v1.id, demoPayments)).rejects.toThrow(/replaced/);
    const thread = await getEnquiryThread(db, planner, enquiryId);
    expect(thread.quotes.map((q) => [q.version, q.status])).toEqual([[2, "active"], [1, "superseded"]]); // history kept
  });

  it("a quote above the planner's strict cap can't go to checkout", async () => {
    const planner = A("planner@gather.test");
    const briefId = await plannerBrief(planner, "2027-05-07", { budget: { mode: "strict", amountPence: 450_000, basis: "total" } });
    const enquiryId = await createEnquiry(db, planner, { briefId, listingId: loomId, extras: [], message: "" });
    const quote = await sendQuote(db, A("owner@gather.test"), enquiryId, { lines: [{ label: "Hire", amountPence: 500_000 }], depositPence: 100_000 });
    await expect(startCheckout(db, planner, enquiryId, quote.id, demoPayments)).rejects.toThrow(/strict budget cap/);
  });
});

describe("checkout and booking", () => {
  it("full journey: pay deposit → booking confirmed → date leaves future searches", async () => {
    const planner = A("planner@gather.test");
    const { briefId, enquiryId, quote } = await quotedEnquiry(planner, "2027-05-08");
    const { checkoutId } = await startCheckout(db, planner, enquiryId, quote.id, demoPayments);
    const result = await fulfilCheckout(db, { providerSessionId: await sessionFor(checkoutId), amountPence: 80_000, currency: "GBP" });
    expect(result.status).toBe("booked");
    const outcome = await searchBrief(db, planner, briefId);
    expect(outcome.shortlist.map((m) => m.venue.slug)).not.toContain("v01-loom-room");
  });

  it("a duplicate 'paid' event returns the same booking, never a second one", async () => {
    const planner = A("planner@gather.test");
    const { enquiryId, quote } = await quotedEnquiry(planner, "2027-05-11");
    const { checkoutId } = await startCheckout(db, planner, enquiryId, quote.id, demoPayments);
    const event = { providerSessionId: await sessionFor(checkoutId), amountPence: 80_000, currency: "GBP" };
    const [a, b] = await Promise.all([fulfilCheckout(db, event), fulfilCheckout(db, event)]);
    expect(a.status === "booked" && b.status === "booked" && a.bookingId === b.bookingId).toBe(true);
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from bookings where enquiry_id = $1", [enquiryId]);
    expect(n).toBe(1);
  });

  it("two planners paying for the same venue-day at once: at most one gets the hold", async () => {
    const first = await quotedEnquiry(A("planner@gather.test"), "2027-05-12");
    const second = await quotedEnquiry(A("maya@gather.test"), "2027-05-12");
    const results = await Promise.allSettled([
      startCheckout(db, A("planner@gather.test"), first.enquiryId, first.quote.id, demoPayments),
      startCheckout(db, A("maya@gather.test"), second.enquiryId, second.quote.id, demoPayments),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/being paid for/);
  });

  it("the database itself refuses a second booking for one listing-day", async () => {
    await expect(
      db.query(
        `insert into bookings (reference, enquiry_id, quote_id, checkout_id, listing_id, planner_id, event_date, total_pence, deposit_pence)
         select 'BK-DUPE', gen_random_uuid(), quote_id, id, listing_id, (select id from profiles limit 1), event_date, 1, 1
         from checkouts where status = 'paid' limit 1`,
      ),
    ).rejects.toThrow();
  });

  it("a declined card releases the hold and the planner can retry", async () => {
    const planner = A("planner@gather.test");
    const { enquiryId, quote } = await quotedEnquiry(planner, "2027-05-13");
    const first = await startCheckout(db, planner, enquiryId, quote.id, demoPayments);
    await failCheckout(db, await sessionFor(first.checkoutId), "Card declined (demo)");
    const retry = await startCheckout(db, planner, enquiryId, quote.id, demoPayments);
    expect(retry.checkoutId).not.toBe(first.checkoutId);
    const result = await fulfilCheckout(db, { providerSessionId: await sessionFor(retry.checkoutId), amountPence: 80_000, currency: "GBP" });
    expect(result.status).toBe("booked");
  });

  it("retrying while a hold is live reuses the same checkout", async () => {
    const planner = A("planner@gather.test");
    const { enquiryId, quote } = await quotedEnquiry(planner, "2027-05-14");
    const a = await startCheckout(db, planner, enquiryId, quote.id, demoPayments);
    const b = await startCheckout(db, planner, enquiryId, quote.id, demoPayments);
    expect(b.checkoutId).toBe(a.checkoutId);
  });

  it("rejects a payment event with the wrong amount or currency", async () => {
    const planner = A("planner@gather.test");
    const { enquiryId, quote } = await quotedEnquiry(planner, "2027-05-15");
    const { checkoutId } = await startCheckout(db, planner, enquiryId, quote.id, demoPayments);
    const session = await sessionFor(checkoutId);
    expect((await fulfilCheckout(db, { providerSessionId: session, amountPence: 1, currency: "GBP" })).status).toBe("rejected");
  });

  it("the owner can't revise a quote while the planner is paying it", async () => {
    const planner = A("planner@gather.test");
    const { enquiryId, quote } = await quotedEnquiry(planner, "2027-05-18");
    await startCheckout(db, planner, enquiryId, quote.id, demoPayments);
    await expect(sendQuote(db, A("owner@gather.test"), enquiryId, { lines: [{ label: "Hire", amountPence: 1 }], depositPence: 1 })).rejects.toThrow(/paying/);
  });
});

describe("enquiries re-check eligibility and notify without private text", () => {
  it("refuses an enquiry if the owner blocked the date after the search", async () => {
    const planner = A("planner@gather.test");
    const briefId = await plannerBrief(planner, "2027-05-19");
    await setDays(db, A("owner@gather.test"), loomId, { from: "2027-05-19", to: "2027-05-19", state: "blocked" });
    await expect(createEnquiry(db, planner, { briefId, listingId: loomId, extras: [], message: "" })).rejects.toThrow(/no longer fits/);
  });

  it("emails link back to the enquiry and never contain the message body", async () => {
    const { enquiryId } = await quotedEnquiry(A("planner@gather.test"), "2027-05-20");
    await postMessage(db, A("owner@gather.test"), enquiryId, "SECRET-DETAIL please bring your own cake knife");
    const mails = await db.query<{ subject: string; link: string }>("select subject, link from email_outbox where link like $1", [`%/enquiries/${enquiryId}`]);
    expect(mails.length).toBeGreaterThanOrEqual(3); // enquiry → owner, quote → planner, reply → planner
    expect(JSON.stringify(mails)).not.toContain("SECRET-DETAIL");
    const bodies = await db.query<{ body_text: string }>("select body_text from email_outbox where link like $1", [`%/enquiries/${enquiryId}`]);
    expect(bodies.every((b) => b.body_text && !b.body_text.includes("SECRET-DETAIL"))).toBe(true);
  });

  it("the booking email to both sides shows total, deposit paid and the balance due through Gather", async () => {
    const planner = A("planner@gather.test");
    const { enquiryId, quote } = await quotedEnquiry(planner, "2027-05-24", 350_000, 70_000);
    const { checkoutId } = await startCheckout(db, planner, enquiryId, quote.id, demoPayments);
    await fulfilCheckout(db, { providerSessionId: await sessionFor(checkoutId), amountPence: 70_000, currency: "GBP" });
    const mails = await db.query<{ to_role: string; body_text: string; link: string }>(
      "select to_role, body_text, link from email_outbox where template = 'booking_confirmed' and link like $1", [`%/enquiries/${enquiryId}`]);
    expect(mails.map((m) => m.to_role).sort()).toEqual(["owner", "planner"]);
    for (const m of mails) {
      expect(m.body_text).toContain("Booking total: £3,500");
      expect(m.body_text).toContain("Paid through Gather: £700");
      expect(m.body_text).toMatch(/Remaining balance \(due by [^)]+\): £2,800/);
      expect(m.body_text).toContain("Cancellation terms");
      expect(m.body_text).toContain("Test payment");
      expect(m.body_text).toContain(m.link); // one absolute call-to-action link
      expect(m.link).toMatch(/^https?:\/\//);
    }
  });
});

describe("admin counts aren't inflated by repeat actions", () => {
  it("re-running a search doesn't add another matched brief", async () => {
    const planner = A("planner@gather.test");
    const briefId = await plannerBrief(planner, "2027-05-21");
    await searchBrief(db, planner, briefId);
    const before = await adminMetrics(db, A("admin@gather.test"), "all");
    await searchBrief(db, planner, briefId);
    const after = await adminMetrics(db, A("admin@gather.test"), "all");
    expect(after.briefs.matched).toBe(before.briefs.matched);
    expect(after.briefs.searches).toBe(before.briefs.searches + 1);
  });
});

describe("OpenAI reader inside the brief flow (fake HTTP)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetConfigForTests();
  });
  const useOpenAi = (response: () => Response) => {
    vi.stubEnv("EXTRACTOR", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk-test-not-real");
    vi.stubGlobal("fetch", vi.fn(async () => response()));
    resetConfigForTests();
  };

  it("records that OpenAI read the brief, and the planner can still correct it", async () => {
    const fields = {
      date: null, dateText: "late March", guests: 80, guestsRange: null, layout: "standing", areaText: "Shoreditch-ish",
      boroughs: ["Hackney"], budget: { mode: "strict", amountPence: 600000, basis: "total" }, eventType: null,
      facilities: Object.fromEntries(FACILITY_CODES.map((c) => [c, c === "av" ? "essential" : null])), conflicts: [],
    };
    useOpenAi(() => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(fields) }] }] })));
    const planner = A("planner@gather.test");
    const id = await createBrief(db, planner, "80 standing near Shoreditch in late March, under £6,000, must have AV.");
    const brief = await getBrief(db, planner, id);
    expect(brief.extractor).toBe("openai:gpt-6-luna");
    expect(brief.extractor_error).toBeNull();
    expect(brief.status).toBe("needs_info"); // exact date still needed
    await updateBriefFields(db, planner, id, { ...brief.confirmed, date: "2027-03-26", guests: 85 });
    const edited = await getBrief(db, planner, id);
    expect(edited.confirmed.guests).toBe(85);
    expect(edited.ai_fields?.guests).toBe(80); // what the model proposed is kept separately
  });

  it("a provider failure is visible: rules reader used, reason stored, admin counts it", async () => {
    useOpenAi(() => new Response("{}", { status: 401 }));
    const planner = A("planner@gather.test");
    const id = await createBrief(db, planner, "Drinks for 60 standing in Shoreditch on 26 March 2027");
    const brief = await getBrief(db, planner, id);
    expect(brief.extractor).toBe("rules-fallback");
    expect(brief.extractor_error).toBe("HTTP 401 (check OPENAI_API_KEY)");
    expect(brief.confirmed.guests).toBe(60); // the planner still gets a usable form
    const metrics = await adminMetrics(db, A("admin@gather.test"), "all");
    expect(metrics.reader.fallback).toBeGreaterThanOrEqual(1);
    expect(metrics.reader.last_error).toBe("HTTP 401 (check OPENAI_API_KEY)");
  });
});

describe("Stripe session expiry", () => {
  it("is at least 30 minutes after creation (Stripe's minimum) and ends before Gather's hold", async () => {
    const { stripeExpiry } = await import("@/lib/adapters/payments");
    const { HOLD_MINUTES } = await import("@/lib/services/checkout");
    const now = Date.parse("2027-01-01T12:00:00Z");
    const holdEnds = new Date(now + HOLD_MINUTES * 60_000 - 500); // DB row written half a second earlier
    const expiry = stripeExpiry(holdEnds, now) * 1000;
    expect(expiry - now).toBeGreaterThanOrEqual(30 * 60_000);
    expect(expiry).toBeLessThan(holdEnds.getTime());
  });
});

describe("booking history: venue filter and sorting", () => {
  it("orders by event date and by total in both directions, and filters by venue, for planner and owner", async () => {
    const { listBookings } = await import("@/lib/services/bookings");
    const maya = A("maya@gather.test");
    const sam = A("owner@gather.test");
    // Three bookings at The Loom Room with dates and totals in different orders.
    const made: { date: string; total: number }[] = [
      { date: "2027-06-08", total: 300_000 },
      { date: "2027-06-03", total: 500_000 },
      { date: "2027-06-10", total: 400_000 },
    ];
    for (const b of made) {
      const { enquiryId, quote } = await quotedEnquiry(maya, b.date, b.total, 60_000);
      const { checkoutId } = await startCheckout(db, maya, enquiryId, quote.id, demoPayments);
      await fulfilCheckout(db, { providerSessionId: await sessionFor(checkoutId), amountPence: 60_000, currency: "GBP" });
    }
    const ours = (rows: { event_date: string; total_pence: number }[]) =>
      rows.filter((r) => made.some((m) => m.date === r.event_date)).map((r) => `${r.event_date}:${r.total_pence}`);
    for (const actor of [maya, sam]) {
      expect(ours(await listBookings(db, actor, { sort: "date-asc" }))).toEqual(["2027-06-03:500000", "2027-06-08:300000", "2027-06-10:400000"]);
      expect(ours(await listBookings(db, actor, { sort: "date-desc" }))).toEqual(["2027-06-10:400000", "2027-06-08:300000", "2027-06-03:500000"]);
      expect(ours(await listBookings(db, actor, { sort: "total-asc" }))).toEqual(["2027-06-08:300000", "2027-06-10:400000", "2027-06-03:500000"]);
      expect(ours(await listBookings(db, actor, { sort: "total-desc" }))).toEqual(["2027-06-03:500000", "2027-06-10:400000", "2027-06-08:300000"]);
    }
    // Venue filter: the owner's other listing shows none of these; the Loom Room shows all three.
    const [other] = await db.query<{ id: string }>("select id from listings where owner_id = $1 and id <> $2 limit 1", [sam.id, loomId]);
    expect(ours(await listBookings(db, sam, { listingId: other.id }))).toEqual([]);
    expect(ours(await listBookings(db, sam, { listingId: loomId }))).toHaveLength(3);
  });
});
