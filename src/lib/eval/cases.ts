/**
 * Evaluation case format, shared by the harness (scripts/eval.ts), the labelling sheet and tests.
 *
 *   briefs file: { today, cases: [{ id, scenario, text, followUps, gold, expectNoMatch }] }
 *   labels file: { labeller, labelledAt, labels: { [caseId]: { acceptable: [venue slugs], notes } } }
 *
 * `gold` is what a careful human would extract from the text (after the follow-ups).
 */
import fs from "node:fs";
import { z } from "zod";
import { BriefFieldsSchema, emptyBrief, type BriefFields } from "@/lib/brief/schema";

const GoldSchema = BriefFieldsSchema.pick({
  date: true,
  guests: true,
  layout: true,
  boroughs: true,
  budget: true,
  eventType: true,
  facilities: true,
});
export type Gold = z.infer<typeof GoldSchema>;

export const CaseSchema = z.object({
  id: z.string(),
  scenario: z.string(),
  text: z.string(),
  followUps: z.array(z.object({ field: z.enum(["date", "guests", "budget", "area", "layout"]), answer: z.string() })),
  gold: GoldSchema,
  expectNoMatch: z.boolean(),
});
export type EvalCase = z.infer<typeof CaseSchema>;

export const CasesFileSchema = z.object({ today: z.string(), cases: z.array(CaseSchema) });

export const LabelsFileSchema = z.object({
  labeller: z.string(),
  labelledAt: z.string(),
  labels: z.record(z.string(), z.object({ acceptable: z.array(z.string()), notes: z.string().optional() })),
});
export type LabelsFile = z.infer<typeof LabelsFileSchema>;

export function readCases(file: string) {
  return CasesFileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function readLabels(file: string): LabelsFile | null {
  if (!fs.existsSync(file)) return null;
  return LabelsFileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function goldToBrief(gold: Gold): BriefFields {
  return { ...emptyBrief(), ...gold, conflicts: [] };
}
