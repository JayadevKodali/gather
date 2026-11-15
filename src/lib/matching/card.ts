/**
 * What a shortlist card says, built only from listing data and the confirmed brief.
 * Nothing here comes from the photo or from the AI.
 *
 *   keyLine     "120 standing · £4,200 hire fee"
 *   whyItFits   "Holds 100 standing for your 80, has the AV you need and is in Shoreditch, your area."
 *   upfront     up to four amenities worth seeing before expanding the card
 */
import { areNeighbours } from "@/lib/areas";
import { budgetTotalPence, type ConfirmedBrief } from "@/lib/brief/schema";
import { FACILITY_SHORT, LAYOUT_LABELS, type FacilityCode } from "@/lib/domain";
import { formatPounds } from "./pricing";
import type { Match } from "./types";

const listJoin = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export function capacityText(match: Match, brief: ConfirmedBrief): string {
  const word = brief.layout === "mixed" ? "mixed layout" : LAYOUT_LABELS[brief.layout].toLowerCase();
  return `${match.venue.capacity[brief.layout]} ${word}`;
}

/** Price and its basis. Says "est." whenever extras change the total, and never guesses an unknown. */
export function priceText(match: Match): string {
  const { estimate } = match;
  const base = estimate.lines[0]?.pence ?? null;
  if (estimate.totalPence === null) return `${estimate.basis} + extras to confirm`;
  if (estimate.totalPence === base) return estimate.basis;
  return `${formatPounds(estimate.totalPence)} est. (${estimate.basis} + extras)`;
}

export const keyLine = (match: Match, brief: ConfirmedBrief) => `${capacityText(match, brief)} · ${priceText(match)}`;

const SUITS_PHRASE: Record<string, string> = {
  birthday: "birthdays", wedding: "weddings", town_hall: "town halls", corporate: "corporate events", private: "private parties",
};

/**
 * One specific, factual sentence for the card. Every clause comes from the stored listing or the confirmed
 * brief, and only appears when it's true; nothing is inferred from photos, descriptions or the AI.
 *
 *  1. Layout headroom (always): "Holds 100 standing for your 80".
 *  2. Then at most two of, in this order:
 *     - the essentials asked for (all confirmed by the owner, or the hard filters would have dropped it)
 *     - location against the planner's area ("in Shoreditch, your area" / "in Wapping, next to Hackney")
 *     - the verified price against a budget, only when the estimate is complete and within it
 *     - the owner's own "suits" list matching the event type
 * The date isn't repeated: every card on the shortlist is free on it.
 */
export function whyItFits(match: Match, brief: ConfirmedBrief): string {
  const { venue, estimate } = match;
  const capacity = venue.capacity[brief.layout] ?? 0;
  const word = brief.layout === "mixed" ? "in a mixed layout" : LAYOUT_LABELS[brief.layout].toLowerCase();
  const spare = capacity - brief.guests;
  const head = spare === 0 ? `Holds exactly your ${brief.guests} ${word}` : `Holds ${capacity} ${word} for your ${brief.guests}`;

  const extras: string[] = [];
  const essentials = Object.entries(brief.facilities)
    .filter(([, level]) => level === "essential")
    .map(([code]) => FACILITY_SHORT[code as FacilityCode]);
  if (essentials.length > 0 && essentials.length <= 3) extras.push(`has the ${listJoin(essentials)} you need`);
  else if (essentials.length > 3) extras.push(`has all ${essentials.length} essentials you listed`);

  const place = venue.neighbourhood || venue.borough;
  const nextTo = brief.boroughs.find((b) => areNeighbours(b, venue.borough));
  if (brief.boroughs.includes(venue.borough as never)) extras.push(`is in ${place}, your area`);
  else if (nextTo) extras.push(`is in ${place}, next to ${nextTo}`);

  const cap = budgetTotalPence(brief);
  const complete = estimate.totalPence !== null && estimate.lines.every((l) => l.pence !== null);
  if (cap !== null && complete && estimate.totalPence! <= cap) {
    const under = cap - estimate.totalPence!;
    extras.push(under === 0 ? `comes to ${formatPounds(estimate.totalPence!)}, right on your budget` : `comes to ${formatPounds(estimate.totalPence!)}, ${formatPounds(under)} under your budget`);
  }

  if (brief.eventType && venue.suits.includes(brief.eventType) && SUITS_PHRASE[brief.eventType]) {
    extras.push(`is listed by the owner for ${SUITS_PHRASE[brief.eventType]}`);
  }

  return `${listJoin([head, ...extras.slice(0, 2)])}.`;
}

const PRIORITY: FacilityCode[] = ["stepFree", "accessibleToilet", "av", "bar", "catering", "danceFloor", "projector", "wifi"];

/** Up to four confirmed amenities (codes): what the planner asked for first, then generally useful ones. */
export function upfrontAmenityCodes(match: Match, brief: ConfirmedBrief, limit = 4): FacilityCode[] {
  const has = (code: FacilityCode) => match.venue.facilities[code]?.state === "yes";
  const asked = Object.keys(brief.facilities) as FacilityCode[];
  return [...asked.filter(has), ...PRIORITY.filter((c) => !asked.includes(c) && has(c))].slice(0, limit);
}

export const upfrontAmenities = (match: Match, brief: ConfirmedBrief, limit = 4): string[] =>
  upfrontAmenityCodes(match, brief, limit).map((c) => FACILITY_SHORT[c]);
