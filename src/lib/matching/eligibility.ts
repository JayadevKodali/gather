/**
 * HARD RULES. A venue that fails any of these is never shown, whatever the AI said.
 *
 *  1. Published by the owner
 *  2. The owner has confirmed the date as bookable (unknown = not available)
 *  3. Not already booked or held on that date
 *  4. Holds the guest count IN THE REQUESTED LAYOUT (unknown capacity = not eligible)
 *  5. Every Essential facility is confirmed Available ("not confirmed" fails)
 *  6. With a strict budget cap: the estimate is known and within the cap
 *
 * Exactly at capacity is fine (60 guests, room for 60). One over is not.
 */
import { FACILITY_LABELS, type FacilityCode } from "@/lib/domain";
import { budgetTotalPence, type ConfirmedBrief } from "@/lib/brief/schema";
import { estimate } from "./pricing";
import type { Failure, MatchVenue } from "./types";

export function capacityFor(venue: MatchVenue, layout: ConfirmedBrief["layout"]): number | null {
  return venue.capacity[layout];
}

export function hardRuleFailures(venue: MatchVenue, brief: ConfirmedBrief): Failure[] {
  const failures: Failure[] = [];

  if (!venue.published) failures.push({ code: "unpublished" });

  if (!venue.openDates.has(brief.date)) failures.push({ code: "date_not_confirmed" });
  else if (venue.takenDates.has(brief.date)) failures.push({ code: "date_taken" });

  const capacity = capacityFor(venue, brief.layout);
  if (capacity === null) failures.push({ code: "no_capacity_for_layout", detail: brief.layout });
  else if (capacity < brief.guests) failures.push({ code: "too_small", detail: `${capacity} ${brief.layout}` });

  for (const [code, level] of Object.entries(brief.facilities)) {
    if (level !== "essential") continue;
    if (venue.facilities[code as FacilityCode]?.state !== "yes") {
      failures.push({ code: "essential_missing", detail: FACILITY_LABELS[code as FacilityCode] ?? code });
    }
  }

  if (brief.budget.mode === "strict") {
    const cap = budgetTotalPence(brief);
    const total = estimate(venue, brief, brief.guests).totalPence;
    if (cap !== null) {
      if (total === null) failures.push({ code: "price_unverifiable" });
      else if (total > cap) failures.push({ code: "over_budget_cap" });
    }
  }
  return failures;
}

export const isEligible = (venue: MatchVenue, brief: ConfirmedBrief) => hardRuleFailures(venue, brief).length === 0;
