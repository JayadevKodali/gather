import { describe, expect, it } from "vitest";
import { hardRuleFailures, isEligible } from "@/lib/matching/eligibility";
import { matchVenues, sortShortlist } from "@/lib/matching/match";
import { estimate } from "@/lib/matching/pricing";
import { scoreVenue } from "@/lib/matching/score";
import { fixtureToMatchVenue, loadFixtureVenues } from "@/lib/fixtures";
import { goldToBrief, readCases } from "@/lib/eval/cases";
import type { ConfirmedBrief } from "@/lib/brief/schema";
import { LAYOUTS } from "@/lib/domain";
import { brief, venue } from "./helpers";

const codes = (v = venue(), b = brief()) => hardRuleFailures(v, b).map((f) => f.code);

describe("hard rules (never shown, whatever the AI says)", () => {
  it("accepts a venue that meets every rule", () => {
    expect(isEligible(venue(), brief())).toBe(true);
  });

  it("capacity: exactly at capacity qualifies, one over does not", () => {
    expect(isEligible(venue(), brief({ guests: 100 }))).toBe(true);
    expect(codes(venue(), brief({ guests: 101 }))).toContain("too_small");
  });

  it("capacity is checked for the requested layout (60 seated in a room seating 40 fails)", () => {
    const room = venue({ capacity: { standing: 120, seated: 40, mixed: 60 } });
    expect(codes(room, brief({ guests: 60, layout: "seated" }))).toContain("too_small");
    expect(isEligible(room, brief({ guests: 60, layout: "standing" }))).toBe(true);
  });

  it("unknown capacity for a layout fails", () => {
    const noMixed = venue({ capacity: { standing: 100, seated: 60, mixed: null } });
    expect(codes(noMixed, brief({ layout: "mixed", guests: 20 }))).toContain("no_capacity_for_layout");
  });

  it("a date the owner hasn't confirmed is not available", () => {
    expect(codes(venue({ openDates: new Set() }))).toContain("date_not_confirmed");
  });

  it("a booked or held date is not available", () => {
    expect(codes(venue({ takenDates: new Set(["2027-03-26"]) }))).toContain("date_taken");
  });

  it("unpublished listings never appear", () => {
    expect(codes(venue({ published: false }))).toContain("unpublished");
  });

  it("an Essential facility must be confirmed Available — 'not confirmed' fails", () => {
    const b = brief({ facilities: { av: "essential" } });
    expect(isEligible(venue(), b)).toBe(true);
    expect(codes(venue({ facilities: { av: { state: "unknown", charge: "included", pricePence: null } } }), b)).toContain("essential_missing");
    expect(codes(venue({ facilities: {} }), b)).toContain("essential_missing");
  });

  it("a Preferred facility is never a hard rule", () => {
    expect(isEligible(venue({ facilities: {} }), brief({ facilities: { projector: "preferred" } }))).toBe(true);
  });

  it("a strict cap excludes higher estimates; a flexible budget only affects ranking", () => {
    const pricey = venue({ pricePence: 700_000 });
    expect(codes(pricey, brief({ budget: { mode: "strict", amountPence: 600_000, basis: "total" } }))).toContain("over_budget_cap");
    expect(isEligible(pricey, brief({ budget: { mode: "flexible", amountPence: 600_000, basis: "total" } }))).toBe(true);
  });

  it("a strict cap excludes an estimate that can't be verified (essential extra 'price to confirm')", () => {
    const v = venue({ facilities: { av: { state: "yes", charge: "to_confirm", pricePence: null } } });
    const b = brief({ facilities: { av: "essential" }, budget: { mode: "strict", amountPence: 900_000, basis: "total" } });
    expect(codes(v, b)).toContain("price_unverifiable");
  });

  it("a priced Essential extra counts towards the strict cap", () => {
    const v = venue({ pricePence: 580_000, facilities: { av: { state: "yes", charge: "priced", pricePence: 30_000 } } });
    const cap = { mode: "strict" as const, amountPence: 600_000, basis: "total" as const };
    expect(isEligible(v, brief({ budget: cap }))).toBe(true); // AV not needed → £5,800
    expect(codes(v, brief({ budget: cap, facilities: { av: "essential" } }))).toContain("over_budget_cap"); // £6,100
  });
});

describe("pricing", () => {
  it("hire fee, minimum spend and per head", () => {
    expect(estimate(venue(), brief(), 80).totalPence).toBe(400_000);
    expect(estimate(venue({ pricingModel: "min_spend", pricePence: 250_000 }), brief(), 80).totalPence).toBe(250_000);
    expect(estimate(venue({ pricingModel: "per_head", pricePence: 4_500 }), brief(), 80).totalPence).toBe(360_000);
  });

  it("does not double-count bar or catering inside a minimum spend", () => {
    const v = venue({ pricingModel: "min_spend", pricePence: 250_000, facilities: { bar: { state: "yes", charge: "priced", pricePence: 30_000 } } });
    expect(estimate(v, brief({ facilities: { bar: "essential" } }), 40).totalPence).toBe(250_000);
  });

  it("converts a per-head budget to a total using the guest count", () => {
    const v = venue({ pricingModel: "per_head", pricePence: 6_500 });
    const b = brief({ guests: 80, budget: { mode: "strict", amountPence: 6_000, basis: "per_head" } });
    expect(codes(v, b)).toContain("over_budget_cap"); // £65 > £60 a head
  });
});

describe("matchVenues", () => {
  it("returns at most five, best first, with factual reasons", () => {
    const venues = Array.from({ length: 8 }, (_, i) => venue({ id: `v${i}`, slug: `v${i}`, pricePence: 300_000 + i * 10_000 }));
    const out = matchVenues(brief(), venues);
    expect(out.shortlist).toHaveLength(5);
    expect(out.eligibleCount).toBe(8);
    expect(out.shortlist[0].reasons[0]).toBe("Holds 100 standing — you need 80");
  });

  it("returns an honest empty result with a suggestion when nothing fits", () => {
    const out = matchVenues(brief(), [venue({ takenDates: new Set(["2027-03-26"]) })]);
    expect(out.shortlist).toEqual([]);
    expect(out.suggestions.join(" ")).toMatch(/different date/);
  });

  it("sorting by price reorders the shortlist but never adds an ineligible venue", () => {
    const cheapButBlocked = venue({ id: "blocked", slug: "blocked", pricePence: 1_000, takenDates: new Set(["2027-03-26"]) });
    const a = venue({ id: "a", slug: "a", pricePence: 500_000 });
    const b = venue({ id: "b", slug: "b", pricePence: 300_000 });
    const out = matchVenues(brief(), [cheapButBlocked, a, b], "price-asc");
    expect(out.shortlist.map((m) => m.venue.slug)).toEqual(["b", "a"]);
    expect(sortShortlist(out.shortlist, "price-desc").map((m) => m.venue.slug)).toEqual(["a", "b"]);
  });

  it("ranks the same borough above next door above elsewhere", () => {
    const same = venue({ id: "same", slug: "same", borough: "Hackney" });
    const next = venue({ id: "next", slug: "next", borough: "Tower Hamlets" });
    const far = venue({ id: "far", slug: "far", borough: "Bromley" });
    expect(matchVenues(brief(), [far, next, same]).shortlist.map((m) => m.venue.slug)).toEqual(["same", "next", "far"]);
  });

  it("score parts add up to the score and stay within 0–100", () => {
    const { score, parts } = scoreVenue(venue(), brief());
    expect(parts.area + parts.budget + parts.preferred + parts.size + parts.eventType).toBe(score);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("property check over every fixture venue", () => {
  const venues = loadFixtureVenues().map((v) => fixtureToMatchVenue(v, ["2027-03-12"]));
  const cases = readCases("data/dev-briefs.json").cases;

  it("no shortlisted venue ever breaks a hard rule, for every brief, layout and a sweep of guest counts", () => {
    let checked = 0;
    for (const c of cases) {
      for (const layout of LAYOUTS) {
        for (const guests of [1, 12, 13, 40, 70, 71, 100, 150, 399, 400, 401]) {
          const b = { ...goldToBrief(c.gold), layout, guests } as ConfirmedBrief;
          for (const m of matchVenues(b, venues).shortlist) {
            expect(hardRuleFailures(m.venue, b)).toEqual([]);
            expect(m.venue.capacity[layout]).toBeGreaterThanOrEqual(guests);
            expect(m.venue.openDates.has(b.date) && !m.venue.takenDates.has(b.date)).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
