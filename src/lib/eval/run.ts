/**
 * The evaluation logic (scripts/eval.ts prints it; tests call it directly).
 *
 * Run 1 — "confirmed fields": feed each case's gold structured brief straight to the matcher.
 *         Measures the matcher alone.
 * Run 2 — "raw text": read the original text with the extractor, answer its follow-up
 *         questions with the case's scripted answers, then match. Measures the whole path.
 *
 * Metrics (each reported as numerator / denominator):
 *   Hit@5          cases with ≥1 acceptable venue whose top 5 contains one of them
 *   Rule breaches  shortlisted venues that fail a hard rule (must be 0)
 *   No-match       impossible cases that correctly return an empty shortlist
 *   Follow-ups     raw-text cases that asked exactly the expected questions, in order
 *   Field accuracy raw-text cases whose extracted fields equal the gold fields
 */
import { applyAnswer, nextQuestion } from "@/lib/brief/followup";
import { isSearchable, type BriefFields, type ConfirmedBrief } from "@/lib/brief/schema";
import { hardRuleFailures } from "@/lib/matching/eligibility";
import { matchVenues } from "@/lib/matching/match";
import type { MatchVenue } from "@/lib/matching/types";
import { goldToBrief, type EvalCase, type LabelsFile } from "./cases";

export type Extractor = (text: string, today: string) => Promise<BriefFields> | BriefFields;

export interface CaseResult {
  id: string;
  scenario: string;
  shortlist: string[];
  acceptable: string[] | null; // null = no label for this case
  hit: boolean | null;
  /** How many of the shown venues are on the acceptable list. */
  acceptableShown: number | null;
  breaches: string[];
  /**
   * Shortlisted venues that break a hard rule of the GOLD (human-confirmed) requirements.
   * Differs from `breaches` only in raw-text runs: if the reader drops a must-have or misreads
   * the date, the matcher can obey the wrong brief, and only this check catches it.
   */
  goldBreaches: string[];
  expectNoMatch: boolean;
  noMatchCorrect: boolean | null;
  askedFields?: string[];
  followUpsCorrect?: boolean;
  fieldMismatches?: string[];
  error?: string;
}

export interface RunSummary {
  name: string;
  cases: CaseResult[];
  hitAt5: { numerator: number; denominator: number };
  /** Of all venues shown for labelled briefs, how many were acceptable (stricter than Hit@5). */
  shownAcceptable: { numerator: number; denominator: number };
  breaches: number;
  goldBreaches: number;
  /** Cases where the extractor itself failed (API error, refusal, invalid output). */
  extractorFailures: number;
  noMatch: { numerator: number; denominator: number };
  followUps?: { numerator: number; denominator: number };
  fieldAccuracy?: { numerator: number; denominator: number };
}

const COMPARED_FIELDS = ["date", "guests", "layout", "boroughs", "budget", "eventType", "facilities"] as const;

function compareFields(actual: BriefFields, gold: EvalCase["gold"]): string[] {
  const norm = (v: unknown) => JSON.stringify(v, Object.keys((v ?? {}) as object).sort());
  return COMPARED_FIELDS.filter((field) => {
    const a = field === "boroughs" ? [...actual.boroughs].sort() : actual[field];
    const g = field === "boroughs" ? [...gold.boroughs].sort() : gold[field];
    return norm(a) !== norm(g);
  });
}

function score(c: EvalCase, brief: ConfirmedBrief, venues: MatchVenue[], labels: LabelsFile | null): CaseResult {
  const outcome = matchVenues(brief, venues);
  const shortlist = outcome.shortlist.map((m) => m.venue.slug);
  const breaches = outcome.shortlist
    .filter((m) => hardRuleFailures(m.venue, brief).length > 0)
    .map((m) => m.venue.slug);
  const gold = goldToBrief(c.gold) as ConfirmedBrief;
  const goldBreaches = outcome.shortlist.filter((m) => hardRuleFailures(m.venue, gold).length > 0).map((m) => m.venue.slug);
  const acceptable = labels?.labels[c.id]?.acceptable ?? null;
  const hit = acceptable && acceptable.length > 0 ? shortlist.some((slug) => acceptable.includes(slug)) : null;
  const acceptableShown = acceptable && acceptable.length > 0 ? shortlist.filter((slug) => acceptable.includes(slug)).length : null;
  return {
    acceptableShown,
    id: c.id,
    scenario: c.scenario,
    shortlist,
    acceptable,
    hit,
    breaches,
    goldBreaches,
    expectNoMatch: c.expectNoMatch,
    noMatchCorrect: c.expectNoMatch ? shortlist.length === 0 : null,
  };
}

function summarise(name: string, cases: CaseResult[]): RunSummary {
  const labelled = cases.filter((c) => c.hit !== null);
  const impossible = cases.filter((c) => c.expectNoMatch);
  const summary: RunSummary = {
    name,
    cases,
    hitAt5: { numerator: labelled.filter((c) => c.hit).length, denominator: labelled.length },
    shownAcceptable: {
      numerator: labelled.reduce((n, c) => n + (c.acceptableShown ?? 0), 0),
      denominator: labelled.reduce((n, c) => n + c.shortlist.length, 0),
    },
    breaches: cases.reduce((n, c) => n + c.breaches.length, 0),
    goldBreaches: cases.reduce((n, c) => n + c.goldBreaches.length, 0),
    extractorFailures: cases.filter((c) => c.error?.startsWith("Extractor failed")).length,
    noMatch: { numerator: impossible.filter((c) => c.noMatchCorrect).length, denominator: impossible.length },
  };
  if (cases.some((c) => c.followUpsCorrect !== undefined)) {
    summary.followUps = { numerator: cases.filter((c) => c.followUpsCorrect).length, denominator: cases.length };
    summary.fieldAccuracy = {
      numerator: cases.filter((c) => (c.fieldMismatches ?? ["x"]).length === 0).length,
      denominator: cases.length,
    };
  }
  return summary;
}

export function runConfirmed(cases: EvalCase[], venues: MatchVenue[], labels: LabelsFile | null): RunSummary {
  return summarise(
    "Confirmed fields (matcher only)",
    cases.map((c) => score(c, goldToBrief(c.gold) as ConfirmedBrief, venues, labels)),
  );
}

export async function runRawText(
  cases: EvalCase[],
  today: string,
  venues: MatchVenue[],
  labels: LabelsFile | null,
  extract: Extractor,
): Promise<RunSummary> {
  const results: CaseResult[] = [];
  for (const c of cases) {
    let brief: BriefFields;
    try {
      brief = await extract(c.text, today);
    } catch (error) {
      // A provider failure counts against the run instead of stopping it.
      results.push({
        id: c.id, scenario: c.scenario, shortlist: [], acceptable: labels?.labels[c.id]?.acceptable ?? null,
        hit: (labels?.labels[c.id]?.acceptable.length ?? 0) > 0 ? false : null, acceptableShown: null, breaches: [], goldBreaches: [],
        expectNoMatch: c.expectNoMatch, noMatchCorrect: c.expectNoMatch ? false : null, askedFields: [], followUpsCorrect: false,
        fieldMismatches: ["(extractor failed)"], error: `Extractor failed: ${(error as Error).message}`,
      });
      continue;
    }
    const asked: string[] = [];
    const answers = [...c.followUps];
    let guard = 0;
    for (let q = nextQuestion(brief); q && guard < 6; q = nextQuestion(brief), guard++) {
      asked.push(q.field);
      const scripted = answers.shift();
      if (!scripted || scripted.field !== q.field) break; // asked something unexpected
      const res = applyAnswer(brief, q.field, scripted.answer, today);
      if (!res.ok) break;
      brief = res.brief;
    }
    const followUpsCorrect = JSON.stringify(asked) === JSON.stringify(c.followUps.map((f) => f.field));
    if (!isSearchable(brief)) {
      results.push({
        id: c.id, scenario: c.scenario, shortlist: [], acceptable: labels?.labels[c.id]?.acceptable ?? null,
        hit: (labels?.labels[c.id]?.acceptable.length ?? 0) > 0 ? false : null, acceptableShown: null, breaches: [], goldBreaches: [],
        expectNoMatch: c.expectNoMatch, noMatchCorrect: null, askedFields: asked, followUpsCorrect,
        fieldMismatches: compareFields(brief, c.gold), error: "Brief still incomplete after the scripted answers",
      });
      continue;
    }
    results.push({ ...score(c, brief, venues, labels), askedFields: asked, followUpsCorrect, fieldMismatches: compareFields(brief, c.gold) });
  }
  return summarise("Raw text → extractor → follow-ups → matcher", results);
}

export const pct = (r: { numerator: number; denominator: number }) =>
  r.denominator === 0 ? "n/a" : `${Math.round((100 * r.numerator) / r.denominator)}% (${r.numerator}/${r.denominator})`;
