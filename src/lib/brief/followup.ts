/**
 * Follow-up questions. Plain code, not AI.
 *
 * Gather asks ONE focused question at a time, in this order:
 *   1. anything contradictory or out of scope (two budgets, two dates, not London)
 *   2. the exact date (venues confirm availability day by day, so "late March" isn't enough)
 *   3. the guest count (capacity is a hard rule)
 *   4. the layout (standing, seated and mixed capacities differ)
 * Everything else (area, budget, event type, facilities) is optional and shown as "unknown"
 * on the review screen, where the planner can fill it in.
 */
import { readAnswer } from "./rules-extractor";
import type { BriefField, BriefFields } from "./schema";

export interface FollowUp {
  field: BriefField;
  question: string;
}

export function nextQuestion(brief: BriefFields): FollowUp | null {
  const conflict = brief.conflicts[0];
  if (conflict) return { field: conflict.field, question: conflict.message };
  if (!brief.date) {
    return {
      field: "date",
      question: brief.dateText
        ? `You said “${brief.dateText}”. Which exact date should we check? Venues confirm availability day by day.`
        : "What date is the event? Venues confirm availability day by day, so an exact date helps.",
    };
  }
  if (!brief.guests) {
    return { field: "guests", question: "How many guests are you expecting? Capacity is checked against this number." };
  }
  if (!brief.layout) {
    return {
      field: "layout",
      question: "Will guests mostly be standing, seated, or a mix of both? Venues hold different numbers for each.",
    };
  }
  return null;
}

export type AnswerResult = { ok: true; brief: BriefFields } | { ok: false; hint: string };

/** Apply the planner's reply to the open question. Only the asked-about field changes. */
export function applyAnswer(brief: BriefFields, field: BriefField, answer: string, today: string): AnswerResult {
  const trimmed = answer.trim();
  if (!trimmed) return { ok: false, hint: "Please type an answer, or edit the details below." };
  const parsed = readAnswer(field, trimmed, today, brief);
  const next: BriefFields = { ...brief, conflicts: brief.conflicts.filter((c) => c.field !== field) };

  switch (field) {
    case "date":
      if (!parsed.date) return { ok: false, hint: "Try a date like 26 March 2027." };
      next.date = parsed.date;
      next.dateText = null;
      break;
    case "guests":
      if (!parsed.guests) return { ok: false, hint: "Try a number, like 80." };
      next.guests = parsed.guests;
      next.guestsRange = parsed.guestsRange;
      break;
    case "layout": {
      const t = trimmed.toLowerCase();
      const layout = parsed.layout ?? (/\bmix|both\b/.test(t) ? "mixed" : /\bseat|sit\b/.test(t) ? "seated" : /\bstand\b/.test(t) ? "standing" : null);
      if (!layout) return { ok: false, hint: "Reply standing, seated or mixed." };
      next.layout = layout;
      break;
    }
    case "budget": {
      if (parsed.budget.amountPence === null) {
        if (/\b(no|none|flexible|don't|dont)\b/i.test(trimmed)) {
          next.budget = { mode: "none", amountPence: null, basis: "total" };
          break;
        }
        return { ok: false, hint: "Try an amount like £6,000, and say if it's a hard cap." };
      }
      const flexible = /\b(flexib\w*|guide|around|roughly|about|ish|stretch)\b/i.test(trimmed);
      next.budget = { ...parsed.budget, mode: flexible ? "flexible" : "strict" };
      break;
    }
    case "area":
      if (parsed.boroughs.length === 0) {
        return { ok: false, hint: "Try a London area such as Shoreditch, Southwark or King's Cross." };
      }
      next.boroughs = parsed.boroughs;
      next.areaText = parsed.areaText;
      break;
  }
  return { ok: true, brief: next };
}
