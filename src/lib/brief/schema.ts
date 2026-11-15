/**
 * The structured brief. The extractor (rules or AI) PROPOSES one of these; the server
 * validates it with zod; the planner confirms or edits it before any search runs.
 * Unknown values stay null — nothing is guessed.
 */
import { z } from "zod";
import { BOROUGHS } from "@/lib/areas";
import { EVENT_TYPES, FACILITY_CODES, LAYOUTS } from "@/lib/domain";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2027-03-26");

export const BriefFieldsSchema = z.object({
  /** Exact event date (London local), or null if missing/vague. */
  date: isoDate.nullable(),
  /** The vague phrase, kept so the follow-up can quote it, e.g. "late March". */
  dateText: z.string().max(80).nullable(),
  guests: z.number().int().positive().max(5000).nullable(),
  /** Set when the planner gave a range, e.g. "100-150" (we use the upper figure). */
  guestsRange: z.tuple([z.number().int().positive(), z.number().int().positive()]).nullable(),
  layout: z.enum(LAYOUTS).nullable(),
  areaText: z.string().max(80).nullable(),
  boroughs: z.array(z.enum(BOROUGHS)).max(6),
  budget: z.object({
    /** strict = a cap ("under £6k"); flexible = a guide ("around £5k"); none = not given. */
    mode: z.enum(["strict", "flexible", "none"]),
    amountPence: z.number().int().positive().nullable(),
    basis: z.enum(["total", "per_head"]),
  }),
  eventType: z.enum(EVENT_TYPES).nullable(),
  facilities: z.partialRecord(z.enum(FACILITY_CODES), z.enum(["essential", "preferred"])),
  /** Things that contradict each other (or are out of scope) and need the planner to choose. */
  conflicts: z
    .array(z.object({ field: z.enum(["date", "guests", "budget", "area", "layout"]), message: z.string().max(240) }))
    .max(5),
});
export type BriefField = BriefFields["conflicts"][number]["field"];
export type BriefFields = z.infer<typeof BriefFieldsSchema>;

export const emptyBrief = (): BriefFields => ({
  date: null,
  dateText: null,
  guests: null,
  guestsRange: null,
  layout: null,
  areaText: null,
  boroughs: [],
  budget: { mode: "none", amountPence: null, basis: "total" },
  eventType: null,
  facilities: {},
  conflicts: [],
});

/** A brief that is complete enough to search. */
export type ConfirmedBrief = BriefFields & { date: string; guests: number; layout: NonNullable<BriefFields["layout"]> };

export function isSearchable(brief: BriefFields): brief is ConfirmedBrief {
  return brief.date !== null && brief.guests !== null && brief.layout !== null && brief.conflicts.length === 0;
}

/** Total budget cap in pence, converting a per-head budget using the guest count. */
export function budgetTotalPence(brief: BriefFields): number | null {
  if (brief.budget.mode === "none" || brief.budget.amountPence === null) return null;
  if (brief.budget.basis === "per_head") return brief.guests ? brief.budget.amountPence * brief.guests : null;
  return brief.budget.amountPence;
}
