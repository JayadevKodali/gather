/**
 * matchVenues: the whole matching pipeline in one pure function.
 *
 *   1. hard rules  (eligibility.ts) — remove anything that can't legally/actually host the event
 *   2. score       (score.ts)       — rank what's left
 *   3. top five, with factual reasons
 *   4. if nothing fits, explain which change would help (never applied without the planner)
 *
 * No database, no network, no AI. The same function runs in the app, the tests and the eval.
 */
import { FACILITY_LABELS, type FacilityCode } from "@/lib/domain";
import type { ConfirmedBrief } from "@/lib/brief/schema";
import { hardRuleFailures } from "./eligibility";
import { buildReasons, scoreVenue } from "./score";
import type { FailureCode, Match, MatchOutcome, MatchVenue, ShortlistSort } from "./types";

export const SHORTLIST_SIZE = 5;

/** Stable order: higher score, then cheaper estimate (unknown last), then slug. */
function byMatch(a: Match, b: Match): number {
  return (
    b.score - a.score ||
    (a.estimate.totalPence ?? Number.MAX_SAFE_INTEGER) - (b.estimate.totalPence ?? Number.MAX_SAFE_INTEGER) ||
    a.venue.slug.localeCompare(b.venue.slug)
  );
}

export function sortShortlist(shortlist: Match[], sort: ShortlistSort): Match[] {
  if (sort === "match") return [...shortlist].sort(byMatch);
  const direction = sort === "price-asc" ? 1 : -1;
  return [...shortlist].sort((a, b) => {
    if (a.estimate.totalPence === null) return 1; // unknown prices always last
    if (b.estimate.totalPence === null) return -1;
    return direction * (a.estimate.totalPence - b.estimate.totalPence) || byMatch(a, b);
  });
}

export function matchVenues(brief: ConfirmedBrief, venues: MatchVenue[], sort: ShortlistSort = "match"): MatchOutcome {
  const excluded: Partial<Record<FailureCode, number>> = {};
  const eligible: Match[] = [];
  // Venues that fail exactly one rule: used to suggest what the planner could change.
  const nearMisses: { venue: MatchVenue; code: FailureCode; detail?: string }[] = [];

  for (const venue of venues) {
    const failures = hardRuleFailures(venue, brief);
    for (const f of failures) excluded[f.code] = (excluded[f.code] ?? 0) + 1;
    if (failures.length === 0) {
      const { score, parts, estimate } = scoreVenue(venue, brief);
      eligible.push({ venue, score, parts, estimate, reasons: buildReasons(venue, brief, estimate) });
    } else if (failures.length === 1 && failures[0].code !== "unpublished") {
      nearMisses.push({ venue, code: failures[0].code, detail: failures[0].detail });
    }
  }

  // Sorting reorders the shortlist; it can never bring in a venue that failed a rule.
  const shortlist = sortShortlist([...eligible].sort(byMatch).slice(0, SHORTLIST_SIZE), sort);
  return { shortlist, eligibleCount: eligible.length, excluded, suggestions: suggest(nearMisses, eligible.length) };
}

function suggest(nearMisses: { code: FailureCode; detail?: string }[], eligibleCount: number): string[] {
  if (eligibleCount >= 3) return [];
  const count = (codes: FailureCode[]) => nearMisses.filter((m) => codes.includes(m.code)).length;
  const ideas: string[] = [];
  const dateMiss = count(["date_not_confirmed", "date_taken"]);
  if (dateMiss) ideas.push(`${dateMiss} more venue${dateMiss > 1 ? "s" : ""} would fit on a different date.`);
  const layoutMiss = count(["no_capacity_for_layout", "too_small"]);
  if (layoutMiss) ideas.push(`${layoutMiss} more would fit with fewer guests or a different layout.`);
  const budgetMiss = count(["over_budget_cap", "price_unverifiable"]);
  if (budgetMiss) ideas.push(`${budgetMiss} more would fit if your budget cap were flexible or a little higher.`);
  const essentials = new Map<string, number>();
  for (const m of nearMisses.filter((n) => n.code === "essential_missing")) {
    essentials.set(m.detail ?? "", (essentials.get(m.detail ?? "") ?? 0) + 1);
  }
  for (const [label, n] of essentials) {
    ideas.push(`${n} more would fit if “${label}” were preferred rather than essential.`);
  }
  return ideas;
}

export const facilityLabel = (code: string) => FACILITY_LABELS[code as FacilityCode] ?? code;
