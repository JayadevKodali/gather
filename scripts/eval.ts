/**
 * npm run eval            → development set (Claude's cases) + independent set if labelled
 * npm run eval:live       → also runs the raw-text pass through OpenAI (reads OPENAI_API_KEY from
 *                            .env.local; costs a few pence) and writes eval/results/openai-live.md
 *
 * Writes eval/results/latest.md. Free and repeatable: no network unless --live.
 */
import fs from "node:fs";
import { extractWithRules } from "@/lib/brief/rules-extractor";
import { loadConfig } from "@/lib/config";
import { fixtureToMatchVenue, loadFixtureVenues } from "@/lib/fixtures";
import { readCases, readLabels } from "@/lib/eval/cases";
import { pct, runConfirmed, runRawText, type Extractor, type RunSummary } from "@/lib/eval/run";

const LAUNCH_BAR = "Hit@5 ≥ 80%, zero hard-rule breaches, every impossible brief returns an empty shortlist, every follow-up correct.";

function render(title: string, run: RunSummary): string[] {
  const lines = [`### ${title}: ${run.name}`, ""];
  lines.push(`- **Hit@5:** ${pct(run.hitAt5)}`);
  lines.push(`- **Shown venues that are acceptable (stricter):** ${pct(run.shownAcceptable)}`);
  lines.push(`- **Hard-rule breaches (against the fields the matcher was given):** ${run.breaches}`);
  lines.push(`- **Hard-rule breaches against the gold confirmed requirements:** ${run.goldBreaches}`);
  if (run.extractorFailures) lines.push(`- **Extractor failures (API error, refusal or invalid output):** ${run.extractorFailures}`);
  lines.push(`- **Impossible briefs returned empty:** ${pct(run.noMatch)}`);
  if (run.followUps) lines.push(`- **Asked exactly the right follow-ups:** ${pct(run.followUps)}`);
  if (run.fieldAccuracy) lines.push(`- **All extracted fields matched gold:** ${pct(run.fieldAccuracy)}`);
  lines.push("", "| Case | Scenario | Top 5 | Hit | Acceptable shown | Breaches (given / gold) | Notes |", "|---|---|---|---|---|---|---|");
  for (const c of run.cases) {
    const notes = [
      c.expectNoMatch ? (c.noMatchCorrect ? "empty as expected" : "SHOULD BE EMPTY") : "",
      c.askedFields ? `asked: ${c.askedFields.join(" → ") || "nothing"}${c.followUpsCorrect ? "" : " (UNEXPECTED)"}` : "",
      c.fieldMismatches?.length ? `field mismatch: ${c.fieldMismatches.join(", ")}` : "",
      c.error ?? "",
    ].filter(Boolean).join("; ");
    lines.push(`| ${c.id} | ${c.scenario} | ${c.shortlist.join(", ") || "—"} | ${c.hit === null ? "—" : c.hit ? "✅" : "❌"} | ${c.acceptableShown === null ? "—" : `${c.acceptableShown}/${c.shortlist.length}`} | ${c.breaches.length} / ${c.goldBreaches.length}${c.goldBreaches.length ? ` (${c.goldBreaches.join(", ")})` : ""} | ${notes} |`);
  }
  return [...lines, ""];
}

async function main() {
  const live = process.argv.includes("--live");
  // The live run reads OPENAI_API_KEY from .env.local (never printed). Works on any Node 20.12+.
  if (live && !process.env.OPENAI_API_KEY && fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  const venues = loadFixtureVenues().map((v) => fixtureToMatchVenue(v));
  const out: string[] = [
    "# Gather matcher evaluation",
    "",
    `Generated ${new Date().toISOString()} over ${venues.length} synthetic venues (data/venues.json).`,
    "",
    `**Proposed launch bar:** ${LAUNCH_BAR} A small synthetic benchmark is a sanity check, not proof of production accuracy.`,
    "",
  ];

  // 1. Development set (written and labelled by Claude while building — not independent).
  const dev = readCases("data/dev-briefs.json");
  const devLabels = readLabels("data/dev-labels.json");
  out.push("## Development set (Claude-written, Claude-labelled — NOT independent)", "");
  out.push(...render("Run 1", runConfirmed(dev.cases, venues, devLabels)));
  out.push(...render("Run 2", await runRawText(dev.cases, dev.today, venues, devLabels, extractWithRules)));

  // 2. Independent set (Jay + GPT). Reported only when both files exist.
  out.push("## Independent set (Jay + GPT)", "");
  const indBriefsPath = "eval/independent/briefs.json";
  const indLabels = readLabels("eval/independent/labels.json");
  const ind = fs.existsSync(indBriefsPath) && indLabels ? readCases(indBriefsPath) : null;
  if (!ind || !indLabels) {
    out.push("**PENDING.** Add `eval/independent/briefs.json` and `eval/independent/labels.json` (format in eval/README.md), then re-run `npm run eval`.", "");
  } else {
    out.push(...render("Run 1", runConfirmed(ind.cases, venues, indLabels)));
    out.push(...render("Run 2", await runRawText(ind.cases, ind.today, venues, indLabels, extractWithRules)));
  }

  // 3. Optional: the real OpenAI reader. Kept in its own file because it costs money and
  //    isn't perfectly repeatable, so latest.md stays free and deterministic.
  if (live) {
    const cfg = loadConfig({ ...process.env, GATHER_MODE: "demo", EXTRACTOR: "openai" });
    const liveOut: string[] = ["# OpenAI brief reader: live evaluation", ""];
    if (cfg.extractor.kind !== "openai") {
      liveOut.push("**Not run:** set OPENAI_API_KEY (in .env.local) to run the raw-text pass with OpenAI.");
    } else {
      const { extractWithOpenAi } = await import("@/lib/brief/openai-extractor");
      const ai = cfg.extractor;
      const extract: Extractor = (text, today) => extractWithOpenAi(text, today, ai);
      liveOut.push(
        `Model \`${ai.model}\`, reasoning effort \`${ai.effort}\`, run ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`,
        "Same matcher and hard rules as the other runs; only the brief reader changes.",
        "",
        "## Development set: development results, not independent",
        "",
        `${dev.cases.length} cases written and labelled by Claude while building. They share an author with the code, so they are a sanity check, not evidence of launch quality.`,
        "",
      );
      const devRun = await runRawText(dev.cases, dev.today, venues, devLabels, extract);
      liveOut.push(...render("OpenAI reader (dev set)", devRun));
      let indRun: RunSummary | null = null;
      if (ind && indLabels) {
        liveOut.push(
          "## Independent set",
          "",
          `${ind.cases.length} cases written and labelled by GPT (Jay review pending) without seeing Gather's rankings. Fixed benchmark date ${ind.today}. Labels are not changed after this run.`,
          "",
        );
        indRun = await runRawText(ind.cases, ind.today, venues, indLabels, extract);
        liveOut.push(...render("OpenAI reader (independent set)", indRun));
      } else {
        liveOut.push("## Independent set", "", "**Not run:** eval/independent/briefs.json and labels.json not found.", "");
      }
      // Proof that both sets actually went through the model.
      console.error(
        `[eval:live] model ${ai.model}: dev ${devRun.cases.length} cases (${devRun.extractorFailures} failed calls), ` +
          (indRun ? `independent ${indRun.cases.length} cases (${indRun.extractorFailures} failed calls).` : "independent NOT RUN."),
      );
    }
    fs.mkdirSync("eval/results", { recursive: true });
    fs.writeFileSync("eval/results/openai-live.md", liveOut.join("\n"));
    console.log(liveOut.join("\n"));
    out.push("## OpenAI reader", "", "See `eval/results/openai-live.md` (written by `npm run eval:live`).", "");
  }

  fs.mkdirSync("eval/results", { recursive: true });
  fs.writeFileSync("eval/results/latest.md", out.join("\n"));
  console.log(out.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
