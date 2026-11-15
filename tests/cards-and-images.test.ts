import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { keyLine, priceText, upfrontAmenities, whyItFits } from "@/lib/matching/card";
import { matchVenues } from "@/lib/matching/match";
import { fixtureToMatchVenue, loadFixtureVenues } from "@/lib/fixtures";
import { VENUE_PHOTOS, venuePhoto } from "@/lib/venue-images";
import { brief, venue } from "./helpers";

const only = (v = venue(), b = brief()) => matchVenues(b, [v]).shortlist[0];

describe("venue card text comes only from listing data", () => {
  it("shows capacity for the selected layout and the price basis", () => {
    expect(keyLine(only(venue({ pricePence: 420_000 })), brief())).toBe("100 standing · £4,200 hire fee");
    const seated = brief({ layout: "seated", guests: 40 });
    expect(keyLine(only(venue(), seated), seated)).toBe("60 seated · £4,000 hire fee");
  });

  it("per-head and minimum-spend venues show their basis", () => {
    expect(priceText(only(venue({ pricingModel: "per_head", pricePence: 5_500 })))).toBe("£55 per head × 80");
    expect(priceText(only(venue({ pricingModel: "min_spend", pricePence: 300_000 })))).toBe("£3,000 minimum spend");
  });

  it("says 'est.' when a priced essential extra changes the total, and never guesses an unknown price", () => {
    const b = brief({ facilities: { av: "essential" } });
    const priced = venue({ facilities: { av: { state: "yes", charge: "priced", pricePence: 25_000 } } });
    expect(priceText(only(priced, b))).toBe("£4,250 est. (£4,000 hire fee + extras)");
    const unknown = venue({ facilities: { av: { state: "yes", charge: "to_confirm", pricePence: null } } });
    expect(priceText(only(unknown, b))).toBe("£4,000 hire fee + extras to confirm");
  });

  it("'why it fits' leads with layout headroom from the listing", () => {
    expect(whyItFits(only(venue({ borough: "Bromley", neighbourhood: "" }), brief({ boroughs: [] })), brief({ boroughs: [] }))).toBe("Holds 100 standing for your 80.");
    const exact = brief({ guests: 100, boroughs: [] });
    expect(whyItFits(only(venue(), exact), exact)).toBe("Holds exactly your 100 standing.");
    const seated = brief({ layout: "seated", guests: 40, boroughs: [] });
    expect(whyItFits(only(venue(), seated), seated)).toBe("Holds 60 seated for your 40.");
  });

  it("'why it fits' names the essentials asked for and the location, never a fact that isn't true", () => {
    const b = brief({ facilities: { av: "essential" } });
    expect(whyItFits(only(venue(), b), b)).toBe("Holds 100 standing for your 80, has the AV you need and is in Shoreditch, your area.");
    expect(whyItFits(only(venue({ borough: "Bromley", neighbourhood: "Bromley" }), b), b)).toBe("Holds 100 standing for your 80 and has the AV you need.");
    expect(whyItFits(only(venue({ borough: "Tower Hamlets", neighbourhood: "Wapping" })), brief())).toBe("Holds 100 standing for your 80 and is in Wapping, next to Hackney.");
    const many = brief({ facilities: { av: "essential", bar: "essential", stepFree: "essential", wifi: "essential" } });
    const loaded = venue({ facilities: Object.fromEntries(["av", "bar", "stepFree", "wifi"].map((c) => [c, { state: "yes", charge: "included", pricePence: null }])) });
    expect(whyItFits(only(loaded, many), many)).toMatch(/has all 4 essentials you listed/);
  });

  it("'why it fits' mentions price only when the estimate is complete and within budget", () => {
    const b = brief({ boroughs: [], budget: { mode: "flexible", amountPence: 500_000, basis: "total" } });
    expect(whyItFits(only(venue(), b), b)).toBe("Holds 100 standing for your 80 and comes to £4,000, £1,000 under your budget.");
    const tight = brief({ boroughs: [], budget: { mode: "flexible", amountPence: 300_000, basis: "total" } });
    expect(whyItFits(only(venue(), tight), tight)).not.toMatch(/budget|£/);
    const unknownExtra = brief({ boroughs: [], facilities: { av: "essential" }, budget: { mode: "flexible", amountPence: 900_000, basis: "total" } });
    const toConfirm = venue({ facilities: { av: { state: "yes", charge: "to_confirm", pricePence: null } } });
    expect(whyItFits(only(toConfirm, unknownExtra), unknownExtra)).not.toMatch(/budget/);
  });

  it("'why it fits' uses the owner's stated suitability, and shows at most two extras", () => {
    const corp = brief({ boroughs: [], eventType: "corporate" });
    expect(whyItFits(only(venue(), corp), corp)).toBe("Holds 100 standing for your 80 and is listed by the owner for corporate events.");
    const wedding = brief({ boroughs: [], eventType: "wedding" });
    expect(whyItFits(only(venue(), wedding), wedding)).toBe("Holds 100 standing for your 80.");
    const all = brief({ eventType: "corporate", facilities: { av: "essential" }, budget: { mode: "flexible", amountPence: 500_000, basis: "total" } });
    expect(whyItFits(only(venue(), all), all)).toBe("Holds 100 standing for your 80, has the AV you need and is in Shoreditch, your area.");
  });

  it("'why it fits' reads differently across a real shortlist", () => {
    const venues = loadFixtureVenues().map((v) => fixtureToMatchVenue(v));
    const b = brief({ date: "2027-03-12", boroughs: ["Hackney"], guests: 60, facilities: { bar: "essential" } });
    const lines = matchVenues(b, venues).shortlist.map((m) => whyItFits(m, b));
    expect(lines.length).toBeGreaterThan(1);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("upfront amenities put what the planner asked for first and only list confirmed ones", () => {
    const v = venue({
      facilities: {
        av: { state: "yes", charge: "included", pricePence: null },
        stepFree: { state: "yes", charge: "included", pricePence: null },
        bar: { state: "unknown", charge: "included", pricePence: null },
        projector: { state: "yes", charge: "included", pricePence: null },
      },
    });
    const b = brief({ facilities: { projector: "preferred" } });
    expect(upfrontAmenities(only(v, b), b)).toEqual(["projector", "step-free access", "AV"]);
  });
});

describe("venue photos", () => {
  it("every seeded venue (and the payment-testing room) has a photo file and alt text, and the map has no strays", () => {
    const slugs = [...loadFixtureVenues().map((v) => v.slug), "v90-gather-test-room"].sort();
    expect(Object.keys(VENUE_PHOTOS).sort()).toEqual(slugs);
    for (const slug of slugs) {
      const photo = venuePhoto(slug)!;
      expect(fs.existsSync(path.join("public", photo.src))).toBe(true);
      expect(photo.alt).toMatch(/fictional/);
    }
  });

  it("a new listing without a photo gets no photo (the card uses the drawn fallback)", () => {
    expect(venuePhoto("my-new-room-mhy7k2")).toBeNull();
  });

  it("hero images exist", () => {
    for (const f of ["loom-room-dusk", "loom-room-3d-cutaway", "battersea-glasshouse-daylight"]) {
      expect(fs.existsSync(`public/images/hero/${f}.webp`)).toBe(true);
    }
  });
});

describe("facility icon map", () => {
  it("has an icon for every facility code", async () => {
    const { FACILITY_CODES } = await import("@/lib/domain");
    const { FACILITY_ICON_PATHS } = await import("@/components/FacilityIcon");
    for (const c of FACILITY_CODES) expect(FACILITY_ICON_PATHS[c], c).toMatch(/^M/);
  });
});
