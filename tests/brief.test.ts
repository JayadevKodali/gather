import { describe, expect, it } from "vitest";
import { applyAnswer, nextQuestion } from "@/lib/brief/followup";
import { BRIEF_JSON_SCHEMA, extractWithOpenAi } from "@/lib/brief/openai-extractor";
import { loadConfig } from "@/lib/config";
import { FACILITY_CODES } from "@/lib/domain";
import { extractWithRules } from "@/lib/brief/rules-extractor";
import { budgetTotalPence, isSearchable } from "@/lib/brief/schema";

const TODAY = "2026-11-14";
const read = (text: string) => extractWithRules(text, TODAY);

describe("rules extractor", () => {
  it("reads Amara's example and keeps the vague date as unknown", () => {
    const b = read("80 people, standing, Shoreditch-ish, late March, under 6k, needs AV");
    expect(b).toMatchObject({
      date: null, dateText: "late March", guests: 80, layout: "standing", boroughs: ["Hackney"],
      budget: { mode: "strict", amountPence: 600_000, basis: "total" }, facilities: { av: "essential" },
    });
  });

  it("dates: day-month, month-day, ISO and UK numeric; year rolls forward", () => {
    expect(read("on 26 March 2027").date).toBe("2027-03-26");
    expect(read("March 26th").date).toBe("2027-03-26");
    expect(read("2027-05-01").date).toBe("2027-05-01");
    expect(read("on 9/3/2027").date).toBe("2027-03-09"); // day/month
    expect(read("on 2 November").date).toBe("2027-11-02"); // already passed this year
  });

  it("two different dates become a conflict, not a guess", () => {
    expect(read("either 12 March or 19 March 2027").conflicts[0]?.field).toBe("date");
  });

  it("guest range uses the upper figure and remembers the range", () => {
    expect(read("for 100-150 people")).toMatchObject({ guests: 150, guestsRange: [100, 150] });
  });

  it("does not mistake money for a guest count", () => {
    expect(read("budget £300 for drinks").guests).toBeNull();
  });

  it("budget: strict, flexible, per head, and two budgets in conflict", () => {
    expect(read("under £6,000").budget).toEqual({ mode: "strict", amountPence: 600_000, basis: "total" });
    expect(read("around £3k").budget.mode).toBe("flexible");
    expect(read("£45 a head").budget).toEqual({ mode: "flexible", amountPence: 4_500, basis: "per_head" });
    expect(read("under £2,000 but can stretch to 6k").conflicts[0]?.field).toBe("budget");
  });

  it("layout: explicit words, and drinks-then-dinner as mixed", () => {
    expect(read("80 seated").layout).toBe("seated");
    expect(read("drinks then dinner").layout).toBe("mixed");
    expect(read("a party").layout).toBeNull();
  });

  it("facilities: essential by default, preferred with softening words", () => {
    const b = read("Needs a projector. Microphones would be nice.");
    expect(b.facilities).toEqual({ projector: "essential", microphones: "preferred" });
  });

  it("flags a city outside London as a conflict", () => {
    expect(read("party in Manchester").conflicts[0]?.field).toBe("area");
  });
});

describe("follow-ups: one question at a time, in priority order", () => {
  it("asks about conflicts, then date, then guests, then layout", () => {
    let b = read("Need a venue for a party under £2k or maybe £5k");
    expect(nextQuestion(b)?.field).toBe("budget");
    b = { ...b, conflicts: [] };
    expect(nextQuestion(b)?.field).toBe("date");
    b = { ...b, date: "2027-05-14" };
    expect(nextQuestion(b)?.field).toBe("guests");
    b = { ...b, guests: 30 };
    expect(nextQuestion(b)?.field).toBe("layout");
    b = { ...b, layout: "standing" };
    expect(nextQuestion(b)).toBeNull();
    expect(isSearchable(b)).toBe(true);
  });

  it("quotes the planner's vague date back to them", () => {
    expect(nextQuestion(read("late March for 80 standing"))?.question).toContain("“late March”");
  });

  it("'the 26th' after 'late March' resolves to 26 March", () => {
    const b = read("late March for 80 standing");
    const res = applyAnswer(b, "date", "the 26th", TODAY);
    expect(res.ok && res.brief.date).toBe("2027-03-26");
  });

  it("an unreadable answer gives a hint and changes nothing", () => {
    const res = applyAnswer(read("for 80 standing"), "date", "soon-ish", TODAY);
    expect(res.ok).toBe(false);
  });

  it("resolving a budget conflict sets a strict cap unless the planner says it's flexible", () => {
    const b = read("under £2,000 but can stretch to 6k");
    const strict = applyAnswer(b, "budget", "£6,000 is the limit", TODAY);
    expect(strict.ok && strict.brief.budget).toEqual({ mode: "strict", amountPence: 600_000, basis: "total" });
    const flexible = applyAnswer(b, "budget", "around £6,000, flexible", TODAY);
    expect(flexible.ok && flexible.brief.budget.mode).toBe("flexible");
    expect(flexible.ok && flexible.brief.conflicts).toEqual([]);
  });

  it("per-head budget converts to a total cap", () => {
    expect(budgetTotalPence({ ...read("£60 a head"), guests: 100 })).toBe(600_000);
  });
});

describe("OpenAI brief reader (fake HTTP — no real model call)", () => {
  const cfg = { apiKey: "sk-test-not-real", model: "gpt-6-luna" };
  const allFacilities = Object.fromEntries(FACILITY_CODES.map((c) => [c, null]));
  const answer = (fields: Record<string, unknown>) => ({
    date: null, dateText: null, guests: null, guestsRange: null, layout: null, areaText: null, boroughs: [],
    budget: { mode: "none", amountPence: null, basis: "total" }, eventType: null, facilities: allFacilities, conflicts: [], ...fields,
  });
  /** Mimics a Responses API body: output[] → message → output_text holding the JSON. */
  const responsesBody = (json: unknown, extra: Record<string, unknown> = {}) => ({
    status: "completed",
    output: [
      { type: "reasoning", summary: [] },
      { type: "message", content: [{ type: "output_text", text: typeof json === "string" ? json : JSON.stringify(json) }] },
    ],
    ...extra,
  });
  const fake = (body: unknown, status = 200, seen?: { url?: string; init?: RequestInit }) =>
    (async (url: string, init: RequestInit) => {
      if (seen) Object.assign(seen, { url, init });
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;

  it("sends a strict json_schema request to the Responses API, server-side, without storing", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    await extractWithOpenAi("80 standing", TODAY, cfg, fake(responsesBody(answer({ guests: 80, layout: "standing" })), 200, seen));
    expect(seen.url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(seen.init?.body));
    expect(body.model).toBe("gpt-6-luna");
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true, name: "event_brief" });
    expect((seen.init?.headers as Record<string, string>).authorization).toBe("Bearer sk-test-not-real");
  });

  it("schema follows strict-mode rules: every property required, no extra properties", () => {
    const check = (node: Record<string, unknown>) => {
      if (node.properties) {
        expect(node.additionalProperties).toBe(false);
        expect(new Set(node.required as string[])).toEqual(new Set(Object.keys(node.properties as object)));
        for (const child of Object.values(node.properties as Record<string, Record<string, unknown>>)) check(child);
      }
      if (node.items) check(node.items as Record<string, unknown>);
    };
    check(BRIEF_JSON_SCHEMA as unknown as Record<string, unknown>);
  });

  it("reads Amara's example: vague date stays vague so Gather asks for the exact day", async () => {
    const b = await extractWithOpenAi("x", TODAY, cfg, fake(responsesBody(answer({
      dateText: "late March", guests: 80, layout: "standing", areaText: "Shoreditch-ish", boroughs: ["Hackney"],
      budget: { mode: "strict", amountPence: 600000, basis: "total" }, facilities: { ...allFacilities, av: "essential" },
    }))));
    expect(b).toMatchObject({ date: null, guests: 80, layout: "standing", boroughs: ["Hackney"], facilities: { av: "essential" } });
    expect(Object.keys(b.facilities)).toEqual(["av"]); // nulls for unmentioned facilities are dropped
    expect(nextQuestion(b)?.field).toBe("date");
  });

  it("rejects output that fails Gather's own validation instead of trusting it", async () => {
    await expect(extractWithOpenAi("x", TODAY, cfg, fake(responsesBody(answer({ guests: -5 }))))).rejects.toThrow(/validation at guests/);
    await expect(extractWithOpenAi("x", TODAY, cfg, fake(responsesBody(answer({ boroughs: ["Narnia"] }))))).rejects.toThrow(/validation/);
    await expect(extractWithOpenAi("x", TODAY, cfg, fake(responsesBody("{not json")))).rejects.toThrow(/not JSON/);
  });

  it("treats a past date from the model as unclear so the follow-up asks", async () => {
    const b = await extractWithOpenAi("x", TODAY, cfg, fake(responsesBody(answer({ date: "2020-01-01", guests: 10 }))));
    expect(b.date).toBeNull();
    expect(nextQuestion(b)?.field).toBe("date");
  });

  it("reports refusals, incomplete responses and HTTP errors with a short reason (no key, no brief text)", async () => {
    const refusal = { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] };
    await expect(extractWithOpenAi("x", TODAY, cfg, fake(refusal))).rejects.toThrow(/refused/);
    await expect(extractWithOpenAi("x", TODAY, cfg, fake({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }))).rejects.toThrow(/incomplete \(max_output_tokens\)/);
    await expect(extractWithOpenAi("x", TODAY, cfg, fake({ error: { message: "bad key sk-test-not-real" } }, 401))).rejects.toThrow("OpenAI brief reader failed: HTTP 401 (check OPENAI_API_KEY)");
    await expect(extractWithOpenAi("secret brief", TODAY, cfg, fake({}, 500))).rejects.not.toThrow(/secret|sk-test/);
  });

  it("reports a network failure or timeout", async () => {
    const down = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    await expect(extractWithOpenAi("x", TODAY, cfg, down)).rejects.toThrow(/network error/);
    const slow = (async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); }) as unknown as typeof fetch;
    await expect(extractWithOpenAi("x", TODAY, cfg, slow)).rejects.toThrow(/timed out/);
  });
});

describe("OpenAI configuration", () => {
  const connected = { GATHER_MODE: "connected", APP_URL: "https://gather.example", DATABASE_URL: "postgres://x", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x", RESEND_API_KEY: "re_x", EMAIL_FROM: "Gather <a@b.c>" };

  it("connected mode requires OPENAI_API_KEY, not ANTHROPIC_API_KEY", () => {
    expect(() => loadConfig(connected)).toThrow(/OPENAI_API_KEY/);
    expect(() => loadConfig({ ...connected, ANTHROPIC_API_KEY: "x" })).toThrow(/OPENAI_API_KEY/);
    const cfg = loadConfig({ ...connected, OPENAI_API_KEY: "sk-x" });
    expect(cfg.extractor).toMatchObject({ kind: "openai", model: "gpt-6-luna", effort: "low" });
  });

  it("OPENAI_MODEL overrides the default; EXTRACTOR=rules needs no key", () => {
    expect(loadConfig({ ...connected, OPENAI_API_KEY: "sk-x", OPENAI_MODEL: "gpt-5-mini" }).extractor).toMatchObject({ model: "gpt-5-mini" });
    expect(loadConfig({ ...connected, EXTRACTOR: "rules" }).extractor).toEqual({ kind: "rules" });
  });

  it("demo mode keeps the local rules reader unless OpenAI is explicitly switched on", () => {
    expect(loadConfig({ OPENAI_API_KEY: "sk-x" }).extractor).toEqual({ kind: "rules" });
    expect(loadConfig({ OPENAI_API_KEY: "sk-x", EXTRACTOR: "openai" }).extractor.kind).toBe("openai");
  });
});
