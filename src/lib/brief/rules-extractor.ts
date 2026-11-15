/**
 * Deterministic brief reader. No AI, no network: plain patterns.
 *
 * Used in demo mode, in tests and in the evaluation harness so results are repeatable.
 * The AI extractor (llm-extractor.ts) returns the same BriefFields shape and goes through
 * the same validation and follow-up logic, so the rest of the app doesn't care which ran.
 *
 * Rule of thumb: if a value isn't clearly stated, leave it null and let the follow-up ask.
 */
import { boroughsInText } from "@/lib/areas";
import type { EventType, FacilityCode, Layout } from "@/lib/domain";
import { emptyBrief, type BriefFields } from "./schema";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const monthIndex = (word: string) => MONTHS.findIndex((m) => m.startsWith(word.toLowerCase().slice(0, 3)));
const pad = (n: number) => String(n).padStart(2, "0");

function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** With no year given, use the next time that day comes round on or after `today`. */
function withYear(month: number, day: number, year: number | null, today: string): string | null {
  const [ty, tm, td] = today.split("-").map(Number);
  let y = year ?? ty;
  if (year === null && (month < tm || (month === tm && day < td))) y = ty + 1;
  if (y < 100) y += 2000;
  return isRealDate(y, month, day) ? `${y}-${pad(month)}-${pad(day)}` : null;
}

function findDates(text: string, today: string): { exact: string[]; vague: string | null } {
  const exact = new Set<string>();
  const t = text.toLowerCase();

  for (const m of t.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    if (isRealDate(+m[1], +m[2], +m[3])) exact.add(`${m[1]}-${m[2]}-${m[3]}`);
  }
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    const iso = withYear(+m[2], +m[1], m[3] ? +m[3] : null, today); // UK order: day/month
    if (iso) exact.add(iso);
  }
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${MONTH_RE}\\b(?:,?\\s+(20\\d{2}))?`, "g"))) {
    const iso = withYear(monthIndex(m[2]) + 1, +m[1], m[3] ? +m[3] : null, today);
    if (iso) exact.add(iso);
  }
  for (const m of t.matchAll(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d{2}))?`, "g"))) {
    const iso = withYear(monthIndex(m[1]) + 1, +m[2], m[3] ? +m[3] : null, today);
    if (iso) exact.add(iso);
  }

  let vague: string | null = null;
  if (exact.size === 0) {
    const vaguePatterns = [
      new RegExp(`\\b((?:early|mid|late|end of|start of|beginning of|middle of)[- ]${MONTH_RE})\\b`),
      new RegExp(`\\b((?:a|any|one)\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\s+in\\s+${MONTH_RE})\\b`),
      new RegExp(`\\b((?:in|during|sometime in|some time in)\\s+${MONTH_RE})\\b`),
      /\b(next (?:week|month|year)|this (?:spring|summer|autumn|winter)|(?:in |next )?(?:spring|summer|autumn|winter)|before christmas|after easter|asap|date tbc|tbc)\b/,
    ];
    for (const pattern of vaguePatterns) {
      const m = t.match(pattern);
      if (m) {
        // Keep the planner's own capitals ("late March"), not our lower-cased copy.
        const start = (m.index ?? 0) + m[0].indexOf(m[1]);
        vague = text.slice(start, start + m[1].length);
        break;
      }
    }
  }
  return { exact: [...exact].sort(), vague };
}

const GUEST_NOUN = "(?:people|guests|pax|ppl|persons|attendees|covers|heads|of us|delegates|staff)";

function findGuests(text: string): { counts: number[]; range: [number, number] | null } {
  const t = text.toLowerCase().replace(/,(\d{3})/g, "$1");
  const range = t.match(new RegExp(`\\b(\\d{1,4})\\s*(?:-|–|to)\\s*(\\d{1,4})\\s*${GUEST_NOUN}`));
  if (range) {
    const a = +range[1];
    const b = +range[2];
    if (a > 0 && b > a) return { counts: [b], range: [a, b] };
  }
  const counts = new Set<number>();
  for (const m of t.matchAll(new RegExp(`(?<![£\\d.])\\b(\\d{1,4})\\s*${GUEST_NOUN}`, "g"))) counts.add(+m[1]);
  for (const m of t.matchAll(/(?<![£\d.])\b(\d{1,4})\s*(?:seated|standing|sit[- ]down)\b/g)) counts.add(+m[1]);
  for (const m of t.matchAll(/\b(?:for|party of|group of|team of|headcount(?: of| is)?|numbers?:?)\s+(?:about |around |roughly |approx\.? |up to )?(\d{1,4})\b(?!\s*(?:k\b|pounds|quid|%|am|pm|th|st|nd|rd|\/))/g)) {
    counts.add(+m[1]);
  }
  return { counts: [...counts].filter((n) => n > 0), range: null };
}

const STANDING_RE = /\b(standing|stand-up|drinks|reception|canap[eé]s|mingl\w*|cocktails?|party|networking)\b/;
const SEATED_RE = /\b(seated|sit[- ]down|dinner|banquet|dining|theatre[- ]style|classroom|lunch|conference|talks?|presentations?|town ?hall|workshop)\b/;

function findLayout(text: string): Layout | null {
  const t = text.toLowerCase();
  if (/\bmixed\b|\bhalf (?:seated|standing)\b|\bsome seated\b/.test(t)) return "mixed";
  const explicitStanding = /\b(standing|stand-up)\b/.test(t);
  const explicitSeated = /\b(seated|sit[- ]down)\b/.test(t);
  if (explicitStanding && explicitSeated) return "mixed";
  if (explicitStanding) return "standing";
  if (explicitSeated) return "seated";
  // Weaker clues, e.g. "drinks then dinner" → mixed; "dinner" → seated.
  const standingHint = STANDING_RE.test(t);
  const seatedHint = SEATED_RE.test(t);
  if (standingHint && seatedHint) return "mixed";
  if (seatedHint) return "seated";
  if (standingHint && /\b(drinks|reception|canap[eé]s|cocktails?|mingl\w*|networking)\b/.test(t)) return "standing";
  return null; // "party" alone doesn't tell us
}

interface Money {
  pence: number;
  basis: "total" | "per_head";
  mode: "strict" | "flexible";
}

function findBudgets(text: string): Money[] {
  const t = text.toLowerCase().replace(/(\d),(\d{3})/g, "$1$2");
  const found: Money[] = [];
  const re = /(under|below|less than|no more than|max(?:imum)?|up to|cap(?:ped)? (?:at|of)|strictly|hard (?:limit|cap)(?: of)?|absolute max(?:imum)?|around|about|roughly|approx(?:imately|\.)?|circa|budget(?: is| of)?|stretch to|can do|spend)?\s*(£)?\s*(\d+(?:\.\d+)?)\s*(k\b|grand\b|thousand\b|pounds\b)?\s*(-?ish)?\s*(a head|per head|pp\b|per person|each|a person)?/g;
  for (const m of t.matchAll(re)) {
    const [, word = "", pound, numberText, unit, ish, perHead] = m;
    if (!pound && !unit) continue; // a bare number is not money
    if (!pound && unit === "pounds" && !word) continue;
    let value = parseFloat(numberText);
    if (unit === "k" || unit === "grand" || unit === "thousand") value *= 1000;
    if (!Number.isFinite(value) || value <= 0) continue;
    const strictWords = /^(under|below|less than|no more than|max|maximum|up to|cap|capped|strictly|hard|absolute)/;
    const mode: Money["mode"] = ish || /^(around|about|roughly|approx|circa|budget|stretch|can do|spend)/.test(word)
      ? "flexible"
      : strictWords.test(word) ? "strict" : "flexible";
    found.push({ pence: Math.round(value * 100), basis: perHead ? "per_head" : "total", mode });
  }
  return found;
}

const FACILITY_PATTERNS: [FacilityCode, RegExp][] = [
  ["av", /\b(a\/?v|audio[- ]?visual)\b/],
  ["projector", /\b(projector|projection|big screen|screen)\b/],
  ["microphones", /\b(mics?|microphones?|radio mics?)\b/],
  ["soundSystem", /\b(sound system|pa system|\bpa\b|speakers|dj)\b/],
  ["accessibleToilet", /\baccessible (?:toilet|loo|wc|bathroom)s?\b/],
  ["stepFree", /\b(step[- ]free|wheelchair|level access|accessible venue|fully accessible)\b/],
  ["wifi", /\b(wi-?fi|internet)\b/],
  ["bar", /\b(bar|bar service)\b/],
  ["catering", /\b(catering|food|kitchen|canap[eé]s)\b/],
  ["danceFloor", /\b(dance ?floor|dancing)\b/],
  ["staging", /\b(stage|staging)\b/],
  ["parking", /\bparking\b/],
  ["videoConferencing", /\b(video ?conferenc\w*|hybrid|zoom|teams call|livestream)\b/],
  ["avTechnician", /\b(technician|tech support|av support)\b/],
  ["babyChanging", /\bbaby[- ]chang\w*\b/],
  ["coatCheck", /\b(cloakroom|coat check)\b/],
];
const PREFERRED_WORDS = /\b(ideally|would be nice|nice to have|if possible|preferably|prefer|bonus|optional|would love|helpful)\b/;

function findFacilities(text: string): BriefFields["facilities"] {
  const result: BriefFields["facilities"] = {};
  const sentences = text.toLowerCase().split(/[.;!?\n]+/);
  for (const sentence of sentences) {
    for (const [code, pattern] of FACILITY_PATTERNS) {
      const m = sentence.match(pattern);
      if (!m) continue;
      if (code === "stepFree" && /accessible (?:toilet|loo|wc|bathroom)/.test(sentence) && !/step|wheelchair|level/.test(sentence)) continue;
      const before = sentence.slice(Math.max(0, (m.index ?? 0) - 45), (m.index ?? 0) + m[0].length + 25);
      const level = PREFERRED_WORDS.test(before) ? "preferred" : "essential";
      if (result[code] !== "essential") result[code] = level;
    }
  }
  return result;
}

function findEventType(text: string): EventType | null {
  const t = text.toLowerCase();
  if (/\bbirthday\b|\b\d{2}(?:st|nd|rd|th) (?:party|celebration|bash)\b/.test(t)) return "birthday";
  if (/\bwedding\b|\breception for the bride\b/.test(t)) return "wedding";
  if (/\btown[ -]?hall\b|\ball[- ]hands\b/.test(t)) return "town_hall";
  if (/\b(corporate|conference|team|offsite|off-site|product launch|launch|client|company|summit|away ?day|workshop|staff)\b/.test(t)) return "corporate";
  if (/\b(private party|engagement|anniversary|christening|leaving do|reunion|party)\b/.test(t)) return "private";
  return null;
}

const NON_LONDON = /\b(manchester|birmingham|leeds|bristol|edinburgh|glasgow|liverpool(?! street)|brighton|oxford|cambridge|cardiff)\b/;

const fmtPounds = (pence: number) => `£${(pence / 100).toLocaleString("en-GB")}`;
const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function extractWithRules(text: string, today: string): BriefFields {
  const brief = emptyBrief();

  const dates = findDates(text, today);
  if (dates.exact.length === 1) brief.date = dates.exact[0];
  else if (dates.exact.length > 1) {
    brief.conflicts.push({ field: "date", message: `You mentioned more than one date (${dates.exact.map(fmtDate).join(" and ")}). Which one should we check?` });
  } else brief.dateText = dates.vague;

  const guests = findGuests(text);
  if (guests.range) {
    brief.guests = guests.range[1];
    brief.guestsRange = guests.range;
  } else if (guests.counts.length === 1) brief.guests = guests.counts[0];
  else if (guests.counts.length > 1) {
    brief.conflicts.push({ field: "guests", message: `You mentioned ${guests.counts.join(" and ")} guests. How many should the venue hold?` });
  }

  brief.layout = findLayout(text);

  const area = boroughsInText(text);
  if (area) {
    brief.areaText = area.phrase.replace(/\b\w/g, (c) => c.toUpperCase());
    brief.boroughs = area.boroughs;
  }
  const away = text.toLowerCase().match(NON_LONDON);
  if (away) {
    brief.areaText ??= away[1].replace(/\b\w/g, (c) => c.toUpperCase());
    brief.conflicts.push({ field: "area", message: `Gather only lists London venues for now, and your brief mentions ${away[1].replace(/\b\w/g, (c) => c.toUpperCase())}. Is the event in London? If so, which area?` });
  }

  const budgets = findBudgets(text);
  const distinct = [...new Map(budgets.map((b) => [`${b.basis}:${b.pence}`, b])).values()];
  const sameBasis = (basis: "total" | "per_head") => distinct.filter((b) => b.basis === basis);
  const totals = sameBasis("total");
  const perHead = sameBasis("per_head");
  if (totals.length > 1 || perHead.length > 1) {
    const list = (totals.length > 1 ? totals : perHead).map((b) => fmtPounds(b.pence)).join(" and ");
    brief.conflicts.push({ field: "budget", message: `Your brief mentions two budgets (${list}). Which is the real limit, and is it a hard cap?` });
  } else if (distinct.length > 0) {
    const pick = totals[0] ?? perHead[0];
    brief.budget = { mode: pick.mode, amountPence: pick.pence, basis: pick.basis };
  }

  brief.eventType = findEventType(text);
  brief.facilities = findFacilities(text);
  return brief;
}

/** Read just one field from a follow-up answer (e.g. the planner replying "the 27th"). */
export function readAnswer(field: "date" | "guests" | "layout" | "budget" | "area", answer: string, today: string, context: BriefFields) {
  let text = answer;
  // "the 27th" → borrow the month from the vague phrase ("late March").
  if (field === "date" && context.dateText) {
    const monthWord = context.dateText.match(new RegExp(MONTH_RE, "i"))?.[0];
    if (monthWord && /^\s*(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?\s*$/i.test(answer)) text = `${answer.replace(/the/i, "")} ${monthWord}`;
  }
  if (field === "guests" && /^\s*\d{1,4}\s*$/.test(answer)) text = `${answer.trim()} guests`;
  if (field === "budget" && /^\s*£?\d/.test(answer) && !/(under|max|up to|around|about|cap|strict|flexib)/i.test(answer)) {
    // A bare amount given in answer to "which is the real limit?" is treated as the cap.
    text = `under ${answer}`;
  }
  return extractWithRules(text, today);
}
