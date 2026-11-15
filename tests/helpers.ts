import { emptyBrief, type ConfirmedBrief } from "@/lib/brief/schema";
import type { MatchVenue } from "@/lib/matching/types";

/** A small, fully specified venue for unit tests. Override what the test cares about. */
export function venue(overrides: Partial<MatchVenue> = {}): MatchVenue {
  return {
    id: "t-venue",
    slug: "t-venue",
    name: "Test Room",
    borough: "Hackney",
    neighbourhood: "Shoreditch",
    venueType: "Warehouse",
    suits: ["corporate"],
    capacity: { standing: 100, seated: 60, mixed: 80 },
    pricingModel: "hire_fee",
    pricePence: 400_000,
    facilities: { av: { state: "yes", charge: "included", pricePence: null } },
    published: true,
    openDates: new Set(["2027-03-26"]),
    takenDates: new Set(),
    ...overrides,
  };
}

export function brief(overrides: Partial<ConfirmedBrief> = {}): ConfirmedBrief {
  return {
    ...emptyBrief(),
    date: "2027-03-26",
    guests: 80,
    layout: "standing",
    boroughs: ["Hackney"],
    ...overrides,
  } as ConfirmedBrief;
}
