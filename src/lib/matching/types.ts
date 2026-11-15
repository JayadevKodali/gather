import type { EventType, FacilityCode, Layout, PricingModel, VenueFacility } from "@/lib/domain";

/** Everything the matcher needs to know about one venue. Built from the database or the fixtures. */
export interface MatchVenue {
  id: string;
  slug: string;
  name: string;
  borough: string;
  neighbourhood: string;
  venueType: string;
  suits: EventType[];
  capacity: Record<Layout, number | null>;
  pricingModel: PricingModel;
  pricePence: number;
  facilities: Partial<Record<FacilityCode, VenueFacility>>;
  published: boolean;
  /** Days the owner has confirmed as bookable. A day not listed is NOT available. */
  openDates: ReadonlySet<string>;
  /** Days already booked, or held by a checkout in progress. */
  takenDates: ReadonlySet<string>;
}

export type FailureCode =
  | "unpublished"
  | "date_not_confirmed"
  | "date_taken"
  | "no_capacity_for_layout"
  | "too_small"
  | "essential_missing"
  | "over_budget_cap"
  | "price_unverifiable";

export interface Failure {
  code: FailureCode;
  detail?: string;
}

export interface PriceLine {
  label: string;
  pence: number | null; // null = price to confirm with the venue
}

export interface Estimate {
  lines: PriceLine[];
  /** null when any required line has no confirmed price. */
  totalPence: number | null;
  /** Short label for how the base price works, e.g. "£55 per head × 80". */
  basis: string;
}

export interface ScoreParts {
  area: number;
  budget: number;
  preferred: number;
  size: number;
  eventType: number;
}

export interface Match {
  venue: MatchVenue;
  score: number;
  parts: ScoreParts;
  estimate: Estimate;
  reasons: string[];
}

export type ShortlistSort = "match" | "price-asc" | "price-desc";

export interface MatchOutcome {
  shortlist: Match[];
  eligibleCount: number;
  /** How many venues were excluded for each hard rule (a venue can fail several). */
  excluded: Partial<Record<FailureCode, number>>;
  /** Plain-English ideas for an empty or thin result. Never applied without the planner. */
  suggestions: string[];
}
