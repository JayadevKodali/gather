/**
 * Price estimates, in whole pence.
 *
 *   hire fee      → the fee
 *   minimum spend → the minimum (food and drink count towards it)
 *   per head      → price × guests
 * plus any EXTRA the planner marked Essential that the venue charges for.
 * If a required extra is "price to confirm", the total is unknown (null), never guessed.
 */
import { COVERED_BY_MIN_SPEND, FACILITY_LABELS, type FacilityCode } from "@/lib/domain";
import type { BriefFields } from "@/lib/brief/schema";
import type { Estimate, MatchVenue, PriceLine } from "./types";

export const formatPounds = (pence: number) =>
  `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function basePrice(venue: Pick<MatchVenue, "pricingModel" | "pricePence">, guests: number): PriceLine & { basis: string } {
  switch (venue.pricingModel) {
    case "hire_fee":
      return { label: "Venue hire", pence: venue.pricePence, basis: `${formatPounds(venue.pricePence)} hire fee` };
    case "min_spend":
      return {
        label: "Minimum spend (food and drink)",
        pence: venue.pricePence,
        basis: `${formatPounds(venue.pricePence)} minimum spend`,
      };
    case "per_head":
      return {
        label: `${guests} guests × ${formatPounds(venue.pricePence)}`,
        pence: venue.pricePence * guests,
        basis: `${formatPounds(venue.pricePence)} per head × ${guests}`,
      };
  }
}

/** Priced extras for the facilities the planner needs. */
export function requiredExtras(venue: MatchVenue, codes: FacilityCode[]): PriceLine[] {
  const lines: PriceLine[] = [];
  for (const code of codes) {
    const facility = venue.facilities[code];
    if (!facility || facility.state !== "yes" || facility.charge === "included") continue;
    if (venue.pricingModel === "min_spend" && COVERED_BY_MIN_SPEND.includes(code)) continue; // no double-counting
    lines.push({
      label: FACILITY_LABELS[code],
      pence: facility.charge === "priced" ? facility.pricePence : null,
    });
  }
  return lines;
}

export function estimate(venue: MatchVenue, brief: Pick<BriefFields, "facilities">, guests: number): Estimate {
  const base = basePrice(venue, guests);
  const essentials = Object.entries(brief.facilities)
    .filter(([, level]) => level === "essential")
    .map(([code]) => code as FacilityCode);
  const lines: PriceLine[] = [{ label: base.label, pence: base.pence }, ...requiredExtras(venue, essentials)];
  const unknown = lines.some((line) => line.pence === null);
  return {
    lines,
    totalPence: unknown ? null : lines.reduce((sum, line) => sum + (line.pence ?? 0), 0),
    basis: base.basis,
  };
}
