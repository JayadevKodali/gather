/**
 * SOFT RANKING for venues that already passed every hard rule. 0–100 points:
 *
 *   Area          35  same borough 35 · next door 18 · elsewhere 0 · no area given 20
 *   Budget        25  within budget 25 · flexible budget: falls to 0 at 30% over · no budget 15 · price unknown 5
 *   Nice-to-haves 20  share of "Preferred" facilities the venue has (10 if none were asked for)
 *   Size fit      10  fuller rooms feel right: 60%+ full 10 · 40%+ 7 · 25%+ 4 · emptier 1
 *   Event type    10  venue suits this kind of event 10 · not listed 3 · type not given 5
 *
 * Reasons are written from the same facts, so they can't say anything the data doesn't.
 */
import { areNeighbours } from "@/lib/areas";
import { EVENT_TYPE_LABELS, FACILITY_LABELS, LAYOUT_LABELS, type FacilityCode } from "@/lib/domain";
import { budgetTotalPence, type ConfirmedBrief } from "@/lib/brief/schema";
import { capacityFor } from "./eligibility";
import { estimate as estimatePrice, formatPounds } from "./pricing";
import type { Estimate, MatchVenue, ScoreParts } from "./types";

export const WEIGHTS = { area: 35, budget: 25, preferred: 20, size: 10, eventType: 10 } as const;

function areaPoints(venue: MatchVenue, brief: ConfirmedBrief): number {
  if (brief.boroughs.length === 0) return 20;
  if (brief.boroughs.includes(venue.borough as never)) return WEIGHTS.area;
  if (brief.boroughs.some((b) => areNeighbours(b, venue.borough))) return 18;
  return 0;
}

function budgetPoints(total: number | null, brief: ConfirmedBrief): number {
  const cap = budgetTotalPence(brief);
  if (cap === null) return 15;
  if (total === null) return 5;
  if (total <= cap) return WEIGHTS.budget;
  const over = (total - cap) / cap;
  return Math.max(0, Math.round(WEIGHTS.budget * (1 - over / 0.3)));
}

function preferredCodes(brief: ConfirmedBrief): FacilityCode[] {
  return Object.entries(brief.facilities)
    .filter(([, level]) => level === "preferred")
    .map(([code]) => code as FacilityCode);
}

function sizePoints(venue: MatchVenue, brief: ConfirmedBrief): number {
  const capacity = capacityFor(venue, brief.layout) ?? brief.guests;
  const fullness = brief.guests / capacity;
  if (fullness >= 0.6) return 10;
  if (fullness >= 0.4) return 7;
  if (fullness >= 0.25) return 4;
  return 1;
}

export function scoreVenue(venue: MatchVenue, brief: ConfirmedBrief): { score: number; parts: ScoreParts; estimate: Estimate } {
  const est = estimatePrice(venue, brief, brief.guests);
  const wanted = preferredCodes(brief);
  const met = wanted.filter((code) => venue.facilities[code]?.state === "yes").length;
  const parts: ScoreParts = {
    area: areaPoints(venue, brief),
    budget: budgetPoints(est.totalPence, brief),
    preferred: wanted.length === 0 ? 10 : Math.round((WEIGHTS.preferred * met) / wanted.length),
    size: sizePoints(venue, brief),
    eventType: brief.eventType === null ? 5 : venue.suits.includes(brief.eventType) ? WEIGHTS.eventType : 3,
  };
  const score = parts.area + parts.budget + parts.preferred + parts.size + parts.eventType;
  return { score, parts, estimate: est };
}

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Plain-English reasons, built only from stored venue facts and the confirmed brief. */
export function buildReasons(venue: MatchVenue, brief: ConfirmedBrief, est: Estimate): string[] {
  const reasons: string[] = [];
  const capacity = capacityFor(venue, brief.layout)!;
  reasons.push(`Holds ${capacity} ${LAYOUT_LABELS[brief.layout].toLowerCase().split(" ")[0]} — you need ${brief.guests}`);
  reasons.push(`Owner has confirmed ${shortDate(brief.date)} as free`);

  const place = venue.neighbourhood ? `${venue.neighbourhood}, ${venue.borough}` : venue.borough;
  if (brief.boroughs.length === 0) reasons.push(`In ${place}`);
  else if (brief.boroughs.includes(venue.borough as never)) reasons.push(`In ${place} — your area`);
  else {
    const next = brief.boroughs.find((b) => areNeighbours(b, venue.borough));
    reasons.push(next ? `In ${place}, next to ${next}` : `In ${place}, outside your area`);
  }

  const cap = budgetTotalPence(brief);
  const word = brief.budget.mode === "strict" ? "cap" : "guide";
  if (est.totalPence === null) reasons.push(`Est. ${est.basis}; some extras are price to confirm`);
  else if (cap === null) reasons.push(`Est. ${formatPounds(est.totalPence)} (${est.basis})`);
  else if (est.totalPence <= cap) {
    reasons.push(`Est. ${formatPounds(est.totalPence)} — within your ${formatPounds(cap)} ${word}`);
  } else {
    reasons.push(`Est. ${formatPounds(est.totalPence)} — about ${formatPounds(est.totalPence - cap)} over your ${formatPounds(cap)} ${word}`);
  }
  if (venue.pricingModel === "min_spend") reasons.push("Minimum spend: food and drink count towards it");

  const essentials = Object.entries(brief.facilities).filter(([, l]) => l === "essential").map(([c]) => c as FacilityCode);
  if (essentials.length) reasons.push(`Confirmed: ${essentials.map((c) => FACILITY_LABELS[c]).join(", ")}`);
  const extras = est.lines.slice(1);
  for (const line of extras) {
    reasons.push(line.pence === null ? `${line.label}: price to confirm` : `${line.label}: ${formatPounds(line.pence)} extra (in estimate)`);
  }

  const wanted = preferredCodes(brief);
  if (wanted.length) {
    const has = wanted.filter((code) => venue.facilities[code]?.state === "yes");
    reasons.push(
      has.length
        ? `Has ${has.length} of ${wanted.length} nice-to-haves: ${has.map((c) => FACILITY_LABELS[c]).join(", ")}`
        : `None of your ${wanted.length} nice-to-haves confirmed`,
    );
  }
  if (brief.eventType && venue.suits.includes(brief.eventType)) {
    reasons.push(`Often used for: ${EVENT_TYPE_LABELS[brief.eventType].toLowerCase()}`);
  }
  return reasons;
}
