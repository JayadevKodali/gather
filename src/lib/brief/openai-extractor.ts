/**
 * AI brief reader: OpenAI Responses API with a strict Structured Outputs schema.
 * Server-side only. The API key never reaches the browser and is never logged.
 *
 * What the model does: turns the planner's free text into the brief fields below.
 * What the model never does: see venues, rank them or decide eligibility. Gather's own code
 * applies availability, layout capacity, essential facilities and strict budget afterwards,
 * whatever the model returns.
 *
 * Every answer is re-validated with the same zod schema as the rules reader, and the planner
 * reviews and can correct the fields before any search runs.
 *
 * Privacy: only the brief text is sent, with `store: false` so OpenAI doesn't keep the response
 * for later retrieval. No account data is sent.
 */
import { BOROUGHS } from "@/lib/areas";
import { EVENT_TYPES, FACILITY_CODES, LAYOUTS } from "@/lib/domain";
import { BriefFieldsSchema, type BriefFields } from "./schema";

export interface OpenAiConfig {
  apiKey: string;
  model: string;
  /** Reasoning effort for reasoning models. "low" keeps cost and latency down for extraction. */
  effort?: "none" | "low" | "medium" | "high";
  timeoutMs?: number;
}

const ENDPOINT = "https://api.openai.com/v1/responses";

/** Why the AI path didn't produce a brief. Short, safe to store and show (never contains the key or brief). */
export class ExtractorError extends Error {
  constructor(public readonly reason: string) {
    super(`OpenAI brief reader failed: ${reason}`);
    this.name = "ExtractorError";
  }
}

const nullable = (schema: Record<string, unknown>) => ({ ...schema, type: [schema.type as string, "null"] });
const nullableEnum = (values: readonly string[], description?: string) => ({
  type: ["string", "null"],
  enum: [...values, null],
  ...(description ? { description } : {}),
});

/**
 * Strict mode rules (OpenAI docs): every property listed in `required`, `additionalProperties: false`
 * on every object, optional values expressed as a union with null.
 */
export const BRIEF_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    date: nullable({ type: "string", description: "Exact event date as YYYY-MM-DD, only if a specific day is given." }),
    dateText: nullable({ type: "string", description: "The planner's date wording when no exact day is given, e.g. 'late March'." }),
    guests: nullable({ type: "integer", description: "Number of guests. For a range, the upper number." }),
    guestsRange: {
      type: ["array", "null"],
      items: { type: "integer" },
      minItems: 2,
      maxItems: 2,
      description: "[low, high] only when a range was given, otherwise null.",
    },
    layout: nullableEnum(LAYOUTS, "standing, seated or mixed, only if stated or clearly implied (e.g. 'sit-down dinner' = seated)."),
    areaText: nullable({ type: "string", description: "The area words the planner used, e.g. 'Shoreditch-ish'." }),
    boroughs: { type: "array", items: { type: "string", enum: [...BOROUGHS] }, description: "London boroughs for the area words." },
    budget: {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: { type: "string", enum: ["strict", "flexible", "none"], description: "strict for caps (under, max, no more than); flexible for guides (around, about); none if no budget." },
        amountPence: nullable({ type: "integer", description: "Amount in pence: £6k = 600000." }),
        basis: { type: "string", enum: ["total", "per_head"] },
      },
      required: ["mode", "amountPence", "basis"],
    },
    eventType: nullableEnum(EVENT_TYPES),
    facilities: {
      type: "object",
      additionalProperties: false,
      description: "For each facility: 'essential' if needed or a must-have, 'preferred' if nice to have, null if not mentioned.",
      properties: Object.fromEntries(FACILITY_CODES.map((code) => [code, nullableEnum(["essential", "preferred"])])),
      required: [...FACILITY_CODES],
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: { type: "string", enum: ["date", "guests", "budget", "area", "layout"] },
          message: { type: "string", description: "One short sentence the planner will read." },
        },
        required: ["field", "message"],
      },
      description: "Contradictions the planner must resolve, e.g. two different budgets, or a place outside London.",
    },
  },
  required: ["date", "dateText", "guests", "guestsRange", "layout", "areaText", "boroughs", "budget", "eventType", "facilities", "conflicts"],
} as const;

export function instructions(today: string) {
  return [
    `Today is ${today} (Europe/London). Extract event-venue requirements from a planner's message.`,
    "Only record what is clearly stated. Never invent a date, guest count, layout or budget.",
    "A date without a year means the next time that day occurs. Vague dates such as 'late March' are NOT exact: set date to null and put the words in dateText.",
    "Map London neighbourhoods to their borough (Shoreditch → Hackney, Soho → Westminster). Gather only covers London: a place outside London is a conflict.",
    "Money is in pence: £6k = 600000. 'per head', 'pp' or 'a head' means basis per_head.",
    "Facilities: AV, sound or a projector the planner needs is essential; 'ideally' or 'would be nice' is preferred.",
  ].join("\n");
}

interface ResponsesBody {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { message?: string; code?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
}

/** Calls OpenAI and returns validated brief fields, or throws an ExtractorError with a short reason. */
export async function extractWithOpenAi(
  text: string,
  today: string,
  cfg: OpenAiConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<BriefFields> {
  let response: Response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        instructions: instructions(today),
        input: text.slice(0, 2000),
        reasoning: { effort: cfg.effort ?? "low" },
        max_output_tokens: 4000,
        store: false,
        text: { format: { type: "json_schema", name: "event_brief", strict: true, schema: BRIEF_JSON_SCHEMA } },
      }),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 20_000),
    });
  } catch (error) {
    const name = (error as Error).name;
    throw new ExtractorError(name === "TimeoutError" || name === "AbortError" ? "timed out" : "network error");
  }

  if (!response.ok) {
    // Status only: OpenAI error bodies can echo request details, so they aren't stored.
    const hint = response.status === 401 ? " (check OPENAI_API_KEY)" : response.status === 404 ? " (check OPENAI_MODEL)" : response.status === 429 ? " (rate limit or no credit)" : "";
    throw new ExtractorError(`HTTP ${response.status}${hint}`);
  }

  const body = (await response.json()) as ResponsesBody;
  if (body.status && body.status !== "completed") {
    throw new ExtractorError(`response ${body.status}${body.incomplete_details?.reason ? ` (${body.incomplete_details.reason})` : ""}`);
  }
  const parts = (body.output ?? []).filter((item) => item.type === "message").flatMap((item) => item.content ?? []);
  if (parts.some((part) => part.type === "refusal")) throw new ExtractorError("model refused");
  const textPart = parts.find((part) => part.type === "output_text" && typeof part.text === "string");
  if (!textPart?.text) throw new ExtractorError("no structured output");

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(textPart.text) as Record<string, unknown>;
  } catch {
    throw new ExtractorError("output was not JSON");
  }
  return toBriefFields(raw, today);
}

/** Converts the model's JSON to BriefFields and validates it. Exported for tests. */
export function toBriefFields(raw: Record<string, unknown>, today: string): BriefFields {
  // Strict mode makes every facility present; keep only the ones the planner asked for.
  const facilities = Object.fromEntries(
    Object.entries((raw.facilities as Record<string, unknown>) ?? {}).filter(([, value]) => value === "essential" || value === "preferred"),
  );
  const parsed = BriefFieldsSchema.safeParse({ ...raw, facilities });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ExtractorError(`output failed validation at ${issue?.path.join(".") || "root"}`);
  }
  const brief = parsed.data;
  if (brief.guestsRange && brief.guests === null) brief.guests = Math.max(...brief.guestsRange);
  if (brief.date && brief.date < today) {
    // A past date is treated as unclear, so the follow-up asks for it.
    brief.dateText = brief.date;
    brief.date = null;
  }
  return brief;
}
