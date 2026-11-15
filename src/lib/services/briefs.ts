/**
 * Planner briefs: free text → proposed fields → follow-up → confirmed fields → shortlist.
 *
 * `ai_fields` keeps what the extractor proposed; `confirmed` is what the planner accepted or
 * edited. The search only ever runs on `confirmed`, validated server-side.
 */
import type { Db } from "@/lib/db";
import { config } from "@/lib/config";
import { applyAnswer, nextQuestion } from "@/lib/brief/followup";
import { extractWithRules } from "@/lib/brief/rules-extractor";
import { BriefFieldsSchema, isSearchable, type BriefFields } from "@/lib/brief/schema";
import { matchVenues } from "@/lib/matching/match";
import type { MatchOutcome, ShortlistSort } from "@/lib/matching/types";
import { track } from "./analytics";
import { forbidden, invalid, notFound, requireRole, type Actor } from "./errors";
import { loadMatchVenues } from "./listings";

export interface BriefRow {
  id: string;
  planner_id: string;
  raw_text: string;
  extractor: string;
  extractor_error: string | null;
  ai_fields: BriefFields | null;
  confirmed: BriefFields;
  answers: { question: string; answer: string }[];
  status: "needs_info" | "ready" | "searched";
  first_matched_at: Date | null;
  created_at: Date;
}

/** Today's date in London, as YYYY-MM-DD. */
export function londonToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

interface Extraction {
  fields: BriefFields;
  /** "openai:<model>" when the AI read it, "rules" when the rules reader was chosen, "rules-fallback" when the AI failed. */
  extractor: string;
  error: string | null;
}

async function extract(text: string): Promise<Extraction> {
  const cfg = config();
  if (cfg.extractor.kind === "openai") {
    const { extractWithOpenAi } = await import("@/lib/brief/openai-extractor");
    try {
      return { fields: await extractWithOpenAi(text, londonToday(), cfg.extractor), extractor: `openai:${cfg.extractor.model}`, error: null };
    } catch (error) {
      // Visible, not silent: the brief, the planner's page, the admin dashboard and the server log
      // all show that OpenAI didn't run and why. The planner still gets a usable form to correct.
      const reason = error instanceof Error && error.name === "ExtractorError" ? (error as { reason?: string }).reason ?? "failed" : "unexpected error";
      console.error(`[gather] OpenAI brief reader failed (${reason}); used the rules reader instead`);
      return { fields: extractWithRules(text, londonToday()), extractor: "rules-fallback", error: reason };
    }
  }
  return { fields: extractWithRules(text, londonToday()), extractor: "rules", error: null };
}

const statusFor = (fields: BriefFields) => (isSearchable(fields) ? "ready" : "needs_info");

export async function createBrief(db: Db, actor: Actor | null, rawText: string): Promise<string> {
  const planner = requireRole(actor, "planner");
  const text = String(rawText ?? "").trim();
  if (text.length < 5) throw invalid("Describe your event in a sentence or two.");
  if (text.length > 2000) throw invalid("Please keep the description under 2,000 characters.");
  const { fields, extractor, error } = await extract(text);
  const [row] = await db.query<{ id: string }>(
    `insert into briefs (planner_id, raw_text, extractor, extractor_error, ai_fields, confirmed, status)
     values ($1, $2, $3, $4, $5::jsonb, $5::jsonb, $6) returning id`,
    [planner.id, text, extractor, error, JSON.stringify(fields), statusFor(fields)],
  );
  await track(db, "brief_submitted", planner.id, { briefId: row.id, extractor });
  if (error) await track(db, "ai_reader_failed", planner.id, { briefId: row.id, reason: error });
  return row.id;
}

export async function getBrief(db: Db, actor: Actor | null, id: string): Promise<BriefRow> {
  const user = requireRole(actor, "planner");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Brief not found.");
  const [row] = await db.query<BriefRow>("select * from briefs where id = $1", [id]);
  if (!row) throw notFound("Brief not found.");
  if (row.planner_id !== user.id) throw forbidden("That brief belongs to another planner.");
  return row;
}

export async function listBriefs(db: Db, actor: Actor | null) {
  const planner = requireRole(actor, "planner");
  return db.query<BriefRow>("select * from briefs where planner_id = $1 order by created_at desc limit 50", [planner.id]);
}

export async function answerFollowUp(db: Db, actor: Actor | null, id: string, answer: string): Promise<{ hint?: string }> {
  const brief = await getBrief(db, actor, id);
  const question = nextQuestion(brief.confirmed);
  if (!question) return {};
  const result = applyAnswer(brief.confirmed, question.field, answer, londonToday());
  if (!result.ok) return { hint: result.hint };
  await db.query(
    `update briefs set confirmed = $2::jsonb, answers = answers || $3::jsonb, status = $4, updated_at = now() where id = $1`,
    [id, JSON.stringify(result.brief), JSON.stringify([{ question: question.question, answer: answer.slice(0, 300) }]), statusFor(result.brief)],
  );
  await track(db, "clarification_answered", brief.planner_id, { briefId: id, field: question.field });
  return {};
}

/** The planner edited the details on the review screen. Validated in full. */
export async function updateBriefFields(db: Db, actor: Actor | null, id: string, fields: unknown): Promise<BriefFields> {
  const brief = await getBrief(db, actor, id);
  const parsed = BriefFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw invalid(`${issue.path.join(".") || "Brief"}: ${issue.message}`);
  }
  const confirmed = { ...parsed.data, conflicts: [] }; // the planner has now decided
  if (confirmed.date && confirmed.date < londonToday()) throw invalid("The event date is in the past.");
  await db.query("update briefs set confirmed = $2::jsonb, status = $3, updated_at = now() where id = $1", [
    brief.id,
    JSON.stringify(confirmed),
    statusFor(confirmed),
  ]);
  return confirmed;
}

/** Read-only: the current shortlist with fresh availability (used when re-displaying or re-sorting). */
export async function currentShortlist(db: Db, actor: Actor | null, id: string, sort: ShortlistSort = "match") {
  const brief = await getBrief(db, actor, id);
  if (!isSearchable(brief.confirmed)) return null;
  return { brief, outcome: matchVenues(brief.confirmed, await loadMatchVenues(db), sort) };
}

/** Run the matcher on the confirmed brief and save what the planner was shown. */
export async function searchBrief(db: Db, actor: Actor | null, id: string, sort: ShortlistSort = "match"): Promise<MatchOutcome> {
  const brief = await getBrief(db, actor, id);
  if (!isSearchable(brief.confirmed)) throw invalid("Confirm the date, guest count and layout first.");
  const outcome = matchVenues(brief.confirmed, await loadMatchVenues(db), sort);
  await db.transaction(async (tx) => {
    await tx.query("delete from matches where brief_id = $1", [id]);
    for (const [index, m] of outcome.shortlist.entries()) {
      await tx.query(
        "insert into matches (brief_id, listing_id, rank, score, estimate_pence, reasons) values ($1,$2,$3,$4,$5,$6::jsonb)",
        [id, m.venue.id, index + 1, m.score, m.estimate.totalPence, JSON.stringify(m.reasons)],
      );
    }
    await tx.query("insert into search_events (brief_id, result_count) values ($1, $2)", [id, outcome.shortlist.length]);
    // A brief counts as "matched" once, the first time an eligible shortlist exists.
    await tx.query(
      `update briefs set status = 'searched', updated_at = now(),
         first_matched_at = coalesce(first_matched_at, case when $2::int > 0 then now() end) where id = $1`,
      [id, outcome.shortlist.length],
    );
  });
  await track(db, outcome.shortlist.length ? "matches_shown" : "no_match", brief.planner_id, { briefId: id, count: outcome.shortlist.length });
  return outcome;
}
