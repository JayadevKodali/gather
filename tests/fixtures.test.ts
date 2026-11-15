import { describe, expect, it } from "vitest";
import { AREA_ALIASES, areNeighbours, BOROUGHS, isBorough, noneNearArea, plainArea, resolveArea } from "@/lib/areas";
import { expandAvailability, fixtureToMatchVenue, loadFixtureVenues, loadPaymentTestVenues } from "@/lib/fixtures";
import { matchVenues } from "@/lib/matching/match";
import { brief } from "./helpers";
import { readCases } from "@/lib/eval/cases";

describe("synthetic venue fixtures meet the brief", () => {
  const venues = loadFixtureVenues();
  const capacities = venues.flatMap((v) => Object.values(v.capacity).filter((c): c is number => c !== null));

  it("has at least 30 venues with unique stable IDs", () => {
    expect(venues.length).toBeGreaterThanOrEqual(30);
    expect(new Set(venues.map((v) => v.slug)).size).toBe(venues.length);
  });

  it("spans capacity 12 to 400", () => {
    expect(Math.min(...capacities)).toBe(12);
    expect(Math.max(...capacities)).toBe(400);
  });

  it("covers all three pricing models and several boroughs and venue types", () => {
    expect(new Set(venues.map((v) => v.pricingModel))).toEqual(new Set(["hire_fee", "min_spend", "per_head"]));
    expect(new Set(venues.map((v) => v.borough)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(venues.map((v) => v.venueType)).size).toBeGreaterThanOrEqual(15);
  });

  it("includes unknown availability, an unpublished draft and unconfirmed facilities", () => {
    expect(venues.some((v) => v.availability === null)).toBe(true);
    expect(venues.some((v) => !v.published)).toBe(true);
    expect(venues.some((v) => Object.keys(v.facilities).length < 22)).toBe(true);
  });

  it("availability expands to explicit days and keeps blocked days out of open days", () => {
    const { open, blocked } = expandAvailability({ from: "2027-03-01", to: "2027-03-07", closedWeekdays: [0], blocked: ["2027-03-03"] });
    expect(blocked).toEqual(["2027-03-03"]);
    expect(open).not.toContain("2027-03-03");
    expect(open).not.toContain("2027-03-07"); // Sunday
    expect(open).toHaveLength(5);
  });
});

describe("London areas", () => {
  it("has the 33 local authorities", () => expect(BOROUGHS).toHaveLength(33));
  it("neighbours work both ways", () => {
    expect(areNeighbours("Hackney", "Tower Hamlets")).toBe(true);
    expect(areNeighbours("Tower Hamlets", "Hackney")).toBe(true);
    expect(areNeighbours("Hackney", "Bromley")).toBe(false);
  });
  it("resolves neighbourhoods and fuzzy wording", () => {
    expect(resolveArea("Shoreditch-ish")).toEqual(["Hackney"]);
    expect(resolveArea("King's Cross")).toEqual(["Camden"]);
    expect(resolveArea("Westminster")).toEqual(["Westminster"]);
  });
  it("knows the north London neighbourhoods reviewers type, each mapped to real boroughs", () => {
    expect(resolveArea("near Finsbury Park")).toEqual(["Islington", "Haringey"]);
    for (const place of ["Holloway", "Archway", "Old Street", "Hampstead", "Kilburn", "Wembley", "Wood Green", "Muswell Hill", "Seven Sisters", "Hackney Central"]) {
      expect(resolveArea(place), place).not.toEqual([]);
    }
    for (const boroughs of Object.values(AREA_ALIASES)) for (const b of boroughs) expect(isBorough(b)).toBe(true);
  });
  it("drops a leading near/around/in/close to, so the header never says \"near near\"", () => {
    expect(plainArea("near Shoreditch")).toBe("Shoreditch");
    expect(plainArea("Close to  King's Cross")).toBe("King's Cross");
    expect(plainArea("in near Finsbury Park")).toBe("Finsbury Park");
    expect(plainArea("Shoreditch-ish")).toBe("Shoreditch-ish");
    expect(plainArea("Inverness Street")).toBe("Inverness Street");
  });
  it("flags a shortlist with nothing in or next to the planner's area (display only)", () => {
    const venues = loadFixtureVenues().filter((v) => v.published);
    // 121 standing near Shoreditch with AV and a dance floor, on a date the two east London fits are taken.
    const nearby = venues.filter((v) => v.name === "The Kiln Rooms" || v.name === "Foundry Hall").map((v) => v.slug);
    expect(nearby).toHaveLength(2);
    const pool = venues.map((v) => fixtureToMatchVenue(v, nearby.includes(v.slug) ? ["2027-03-26"] : []));
    const big = matchVenues(brief({ date: "2027-03-26", guests: 121, layout: "standing", boroughs: ["Hackney"], facilities: { av: "essential", danceFloor: "essential" } }), pool);
    expect(big.shortlist.map((m) => m.venue.borough).sort()).toEqual(["Lambeth", "Lewisham"]);
    expect(noneNearArea(["Hackney"], big.shortlist.map((m) => m.venue.borough))).toBe(true);
    // Amara's sample brief (80 standing near Shoreditch, AV) has Hackney venues: no notice.
    const amara = matchVenues(brief({ date: "2027-03-26", guests: 80, layout: "standing", boroughs: ["Hackney"], facilities: { av: "essential" } }), venues.map((v) => fixtureToMatchVenue(v)));
    expect(noneNearArea(["Hackney"], amara.shortlist.map((m) => m.venue.borough))).toBe(false);
    expect(noneNearArea(["Hackney"], ["Tower Hamlets"])).toBe(false); // next door counts as near
    expect(noneNearArea([], ["Lambeth"])).toBe(false); // no area given: no notice
  });
  it("a brief for 40 seated near Finsbury Park on 15 October 2027 finds Gather Test Room", () => {
    const venues = [...loadFixtureVenues(), ...loadPaymentTestVenues()].filter((v) => v.published).map((v) => fixtureToMatchVenue(v));
    const outcome = matchVenues(brief({ date: "2027-10-15", guests: 40, layout: "seated", boroughs: resolveArea("near Finsbury Park") }), venues);
    expect(outcome.shortlist.map((m) => m.venue.name)).toContain("Gather Test Room (payment testing)");
  });
});

describe("development eval cases", () => {
  it("has at least 10 messy briefs including a true no-match", () => {
    const { cases } = readCases("data/dev-briefs.json");
    expect(cases.length).toBeGreaterThanOrEqual(10);
    expect(cases.some((c) => c.expectNoMatch)).toBe(true);
  });
});
