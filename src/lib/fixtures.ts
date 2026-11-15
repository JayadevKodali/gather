/**
 * Loads the synthetic venue fixtures (data/venues.json) — the single source for the database
 * seed AND the offline evaluation, so both see exactly the same venues.
 */
import { z } from "zod";
import venuesFile from "../../data/venues.json";
import paymentTestFile from "../../data/payment-test-venue.json";
import { BOROUGHS } from "@/lib/areas";
import { EVENT_TYPES, FACILITY_CODES, PRICING_MODELS, type FacilityCode, type VenueFacility } from "@/lib/domain";
import type { MatchVenue } from "@/lib/matching/types";

const FacilitySchema = z.object({
  state: z.enum(["yes", "no", "unknown"]),
  charge: z.enum(["included", "priced", "to_confirm"]).optional(),
  pricePence: z.number().int().nonnegative().optional(),
  note: z.string().optional(),
});

const capacity = z.number().int().positive().nullable();
export const FixtureVenueSchema = z.object({
  slug: z.string().regex(/^v\d{2}-[a-z0-9-]+$/),
  owner: z.string().email(),
  name: z.string().min(2),
  neighbourhood: z.string(),
  borough: z.enum(BOROUGHS),
  venueType: z.string(),
  suits: z.array(z.enum(EVENT_TYPES)),
  capacity: z.object({ standing: capacity, seated: capacity, mixed: capacity }),
  pricingModel: z.enum(PRICING_MODELS),
  pricePence: z.number().int().positive(),
  facilities: z.partialRecord(z.enum(FACILITY_CODES), FacilitySchema),
  availability: z
    .object({
      from: z.string(),
      to: z.string(),
      closedWeekdays: z.array(z.number().int().min(0).max(6)), // 0 = Sunday
      blocked: z.array(z.string()),
    })
    .nullable(),
  description: z.string(),
  accessNotes: z.string(),
  published: z.boolean(),
});
export type FixtureVenue = z.infer<typeof FixtureVenueSchema>;

export function loadFixtureVenues(): FixtureVenue[] {
  return z.array(FixtureVenueSchema).parse((venuesFile as { venues: unknown }).venues);
}

/** The extra listing for deposit testing (Jul–Dec 2027 only). Seeded, but never part of the evaluation. */
export function loadPaymentTestVenues(): FixtureVenue[] {
  return z.array(FixtureVenueSchema).parse((paymentTestFile as { venues: unknown }).venues);
}

/** Expand an availability rule into explicit days: open days, and blocked days. */
export function expandAvailability(rule: FixtureVenue["availability"]): { open: string[]; blocked: string[] } {
  if (!rule) return { open: [], blocked: [] };
  const open: string[] = [];
  const blocked: string[] = [];
  const blockedSet = new Set(rule.blocked);
  for (let d = new Date(`${rule.from}T12:00:00Z`); d <= new Date(`${rule.to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (blockedSet.has(iso)) blocked.push(iso);
    else if (!rule.closedWeekdays.includes(d.getUTCDay())) open.push(iso);
  }
  return { open, blocked };
}

export function normaliseFacilities(raw: FixtureVenue["facilities"]): Partial<Record<FacilityCode, VenueFacility>> {
  const out: Partial<Record<FacilityCode, VenueFacility>> = {};
  for (const [code, f] of Object.entries(raw)) {
    out[code as FacilityCode] = {
      state: f.state,
      charge: f.charge ?? "included",
      pricePence: f.pricePence ?? null,
      note: f.note,
    };
  }
  return out;
}

/** Fixture → the shape the matcher uses (no database needed). */
export function fixtureToMatchVenue(v: FixtureVenue, takenDates: string[] = []): MatchVenue {
  return {
    id: v.slug,
    slug: v.slug,
    name: v.name,
    borough: v.borough,
    neighbourhood: v.neighbourhood,
    venueType: v.venueType,
    suits: v.suits,
    capacity: v.capacity,
    pricingModel: v.pricingModel,
    pricePence: v.pricePence,
    facilities: normaliseFacilities(v.facilities),
    published: v.published,
    openDates: new Set(expandAvailability(v.availability).open),
    takenDates: new Set(takenDates),
  };
}
