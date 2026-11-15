/**
 * The planner's event in one line, for the summary strip and the sticky search bar (display only):
 *   "80 standing · Thu 25 March 2027 · near Shoreditch · up to £6,000"
 * Built from the saved brief; anything not given yet is left out.
 */
import { budgetTotalPence, type BriefFields } from "@/lib/brief/schema";
import { plainArea } from "@/lib/areas";
import { LAYOUT_LABELS } from "@/lib/domain";
import { formatPounds } from "@/lib/format";

export function summaryDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function briefSummaryParts(b: BriefFields): string[] {
  const parts: string[] = [];
  if (b.guests) parts.push(`${b.guests} ${b.layout === "mixed" ? "mixed" : b.layout ? LAYOUT_LABELS[b.layout].toLowerCase() : "guests"}`);
  else if (b.layout) parts.push(LAYOUT_LABELS[b.layout]);
  if (b.date) parts.push(summaryDate(b.date));
  const area = b.areaText ? plainArea(b.areaText) : "";
  if (area) parts.push(`near ${area}`);
  const cap = budgetTotalPence(b);
  if (cap !== null) parts.push(`${b.budget.mode === "strict" ? "up to" : "around"} ${formatPounds(cap)}`);
  return parts;
}

export const briefSummary = (b: BriefFields) => briefSummaryParts(b).join(" · ");
