/**
 * npm run eval:sheet -- [briefs.json]
 *
 * Writes a labelling sheet: for each brief, every venue that passes the HARD rules, in ID
 * order, with the facts a planner would judge on. No scores and no ranking, so the person
 * labelling isn't anchored by what the matcher thinks.
 *
 * Default input: data/dev-briefs.json. For the independent set: eval/independent/briefs.json
 */
import fs from "node:fs";
import path from "node:path";
import { areNeighbours } from "@/lib/areas";
import { budgetTotalPence, type ConfirmedBrief } from "@/lib/brief/schema";
import { FACILITY_LABELS, LAYOUT_LABELS, type FacilityCode } from "@/lib/domain";
import { fixtureToMatchVenue, loadFixtureVenues } from "@/lib/fixtures";
import { hardRuleFailures, capacityFor } from "@/lib/matching/eligibility";
import { estimate, formatPounds } from "@/lib/matching/pricing";
import { goldToBrief, readCases } from "@/lib/eval/cases";

const input = process.argv[2] ?? "data/dev-briefs.json";
const { cases } = readCases(input);
const venues = loadFixtureVenues().map((v) => fixtureToMatchVenue(v));
const out: string[] = [`# Labelling sheet — ${input}`, "", "Mark each venue ✅ acceptable or ❌ not, using the rubric in eval/README.md.", ""];

for (const c of cases) {
  const brief = goldToBrief(c.gold) as ConfirmedBrief;
  const cap = budgetTotalPence(brief);
  out.push(`## ${c.id} — ${c.scenario}`, "", `> ${c.text}`, "");
  out.push(
    `Confirmed: ${brief.guests} ${LAYOUT_LABELS[brief.layout].toLowerCase()} · ${brief.date} · area ${brief.boroughs.join("/") || "any"} · budget ${cap === null ? "none" : `${brief.budget.mode} ${formatPounds(cap)}`} · needs ${Object.entries(brief.facilities).map(([k, v]) => `${FACILITY_LABELS[k as FacilityCode]} (${v})`).join(", ") || "nothing specific"}`,
    "",
  );
  const eligible = venues.filter((v) => hardRuleFailures(v, brief).length === 0).sort((a, b) => a.slug.localeCompare(b.slug));
  if (eligible.length === 0) {
    out.push("_No venue passes the hard rules. Expected result: an honest empty shortlist._", "");
    continue;
  }
  out.push("| Venue | Area | Type | Fits | Estimate | Preferred met | Label |", "|---|---|---|---|---|---|---|");
  for (const v of eligible) {
    const est = estimate(v, brief, brief.guests).totalPence;
    const area = brief.boroughs.length === 0 ? v.borough
      : brief.boroughs.includes(v.borough as never) ? `${v.borough} (same)`
      : brief.boroughs.some((b) => areNeighbours(b, v.borough)) ? `${v.borough} (next door)` : `${v.borough} (elsewhere)`;
    const preferred = Object.entries(brief.facilities).filter(([, l]) => l === "preferred").map(([code]) => code as FacilityCode);
    const met = preferred.filter((code) => v.facilities[code]?.state === "yes").map((code) => FACILITY_LABELS[code]);
    out.push(`| ${v.slug} ${v.name} | ${area} | ${v.venueType} | ${capacityFor(v, brief.layout)} | ${est === null ? "to confirm" : formatPounds(est)} | ${preferred.length ? met.join(", ") || "none" : "—"} | |`);
  }
  out.push("");
}

const target = path.join("eval", "results", `labelling-sheet-${path.basename(input, ".json")}.md`);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out.join("\n"));
console.log(`Wrote ${target}`);
