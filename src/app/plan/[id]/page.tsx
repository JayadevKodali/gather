import type { Metadata } from "next";
import Link from "next/link";
import { FacilityPicker } from "@/components/FacilityPicker";
import { Notices } from "@/components/Notice";
import { requirePageRole } from "@/lib/auth/session";
import { nextQuestion } from "@/lib/brief/followup";
import { getDb } from "@/lib/db";
import { EVENT_TYPES, EVENT_TYPE_LABELS, LAYOUTS, LAYOUT_LABELS } from "@/lib/domain";
import { poundsInput } from "@/lib/format";
import { getBrief, londonToday } from "@/lib/services/briefs";
import { answerAction, saveDetailsAction } from "../../actions/planner";
import { orNotFound } from "@/lib/services/page-guard";
import { InfoTip } from "@/components/InfoTip";
import { SubmitButton } from "@/components/SubmitButton";
import { StatusPill } from "@/components/StatusPill";
import { briefSummary } from "@/lib/brief-summary";

export const metadata: Metadata = { title: "Your brief" };

export default async function BriefPage({ params, searchParams }: PageProps<"/plan/[id]">) {
  const actor = await requirePageRole("planner");
  const { id } = await params;
  const query = await searchParams;
  const brief = await orNotFound(getBrief(await getDb(), actor, id));
  const b = brief.confirmed;
  const question = nextQuestion(b);
  const unknown = <StatusPill tone="neutral">Not given yet</StatusPill>;

  return (
    <div className="wrap brief-page">
      <div className="page-head">
        <h1>Your brief</h1>
        <Link href="/plan" className="btn quiet">Start a new brief</Link>
      </div>
      <Notices params={query} />
      <div className="brief-column">
        <section className="stack" aria-label="Your brief and Gather's questions">
          <div className="thread" aria-label="Conversation">
            <div className="msg mine"><div className="bubble mine">{brief.raw_text}</div><div className="who">You</div></div>
            {brief.answers.map((a, i) => (
              <div key={i} className="thread">
                <div className="msg theirs"><div className="bubble">{a.question}</div><div className="who">Gather</div></div>
                <div className="msg mine"><div className="bubble mine">{a.answer}</div><div className="who">You</div></div>
              </div>
            ))}
          </div>

          {question ? (
            <form action={answerAction} className="ask" aria-labelledby="question">
              <input type="hidden" name="briefId" value={brief.id} />
              <p id="question" className="mb-0"><strong>One question before we search:</strong> {question.question}</p>
              <div className="row mt-s">
                <label htmlFor="answer" className="sr-only">Your answer</label>
                <input id="answer" name="answer" type="text" required style={{ flex: "1 1 240px" }} placeholder={question.field === "date" ? "e.g. 26 March 2027" : question.field === "guests" ? "e.g. 80" : question.field === "layout" ? "standing, seated or mixed" : ""} autoFocus />
                <SubmitButton pendingLabel="Saving…">Answer</SubmitButton>
              </div>
              <p className="tiny mb-0 mt-s">Or fill in the details directly below.</p>
            </form>
          ) : (
            <p className="notice ok mb-0">We have everything we need. Check the details, then search.</p>
          )}
          {brief.extractor === "rules-fallback" ? (
            <p className="notice info" role="status">
              Our AI reader is unavailable right now ({brief.extractor_error ?? "unknown error"}), so a simpler reader filled in these details.
              Please check each one below before searching.
            </p>
          ) : (
            <p className="tiny">
              Read by: {brief.extractor.startsWith("openai:") ? `OpenAI (${brief.extractor.slice(7)}), then checked by Gather's rules` : "Gather's rules-based reader"}.
              Nothing is searched until you confirm.
            </p>
          )}
        </section>

        <form action={saveDetailsAction} id="details" className="panel details-card" aria-labelledby="details-title">
          <input type="hidden" name="briefId" value={brief.id} />
          <h2 id="details-title">Check the details</h2>
          <p className="small muted">The essentials first. Change anything that isn’t right; nothing is searched until you press Search venues.</p>
          <div className="essentials">
            <div className="field">
              <div className="label-row"><label htmlFor="date">Event date {!b.date && unknown}</label><InfoTip id="date-hint">{b.dateText ? `You said “${b.dateText}”.` : "Venues confirm availability by day."}</InfoTip></div>
              <input id="date" aria-describedby="date-hint" name="date" type="date" min={londonToday()} defaultValue={b.date ?? ""} />
            </div>
            <div className="field">
              <div className="label-row"><label htmlFor="guests">Guests {!b.guests && unknown}</label><InfoTip id="guests-hint">{b.guestsRange ? `You said ${b.guestsRange[0]}–${b.guestsRange[1]}; we use the higher number.` : "Capacity is checked against this."}</InfoTip></div>
              <input id="guests" aria-describedby="guests-hint" name="guests" type="number" min={1} max={5000} defaultValue={b.guests ?? ""} />
            </div>
            <fieldset className="field essentials-layout">
              <legend>Layout {!b.layout && unknown}</legend>
              <div className="choice-row">
                {LAYOUTS.map((l) => (
                  <label key={l} className="choice"><input type="radio" name="layout" value={l} defaultChecked={b.layout === l} /> {LAYOUT_LABELS[l]}</label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <div className="label-row"><label htmlFor="area">Area</label><InfoTip id="area-hint">{b.boroughs.length ? `We read this as ${b.boroughs.join(", ")}.` : "A neighbourhood or borough. Optional."}</InfoTip></div>
              <input id="area" aria-describedby="area-hint" name="area" type="text" defaultValue={b.areaText ?? ""} placeholder="e.g. Shoreditch" />
            </div>
            <div className="field">
              <div className="label-row"><label htmlFor="eventType">Event type</label><InfoTip id="eventType-hint">Optional.</InfoTip></div>
              <select id="eventType" aria-describedby="eventType-hint" name="eventType" defaultValue={b.eventType ?? ""}>
                <option value="">Not specified</option>
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
          </div>
          <fieldset className="essentials-budget">
            <legend>Budget</legend>
            <div className="grid-3">
              <div>
                <label htmlFor="budgetMode">Type</label>
                <select id="budgetMode" name="budgetMode" defaultValue={b.budget.mode}>
                  <option value="none">No budget given</option>
                  <option value="strict">Strict cap (hide anything over)</option>
                  <option value="flexible">Flexible guide (rank by fit)</option>
                </select>
              </div>
              <div>
                <label htmlFor="budgetAmount">Amount (£)</label>
                <input id="budgetAmount" name="budgetAmount" type="text" inputMode="decimal" defaultValue={poundsInput(b.budget.amountPence)} />
              </div>
              <div>
                <label htmlFor="budgetBasis">Per</label>
                <select id="budgetBasis" name="budgetBasis" defaultValue={b.budget.basis}>
                  <option value="total">Event total</option>
                  <option value="per_head">Guest (per head)</option>
                </select>
              </div>
            </div>
          </fieldset>
          <FacilityPicker selected={b.facilities} />
          <div className="search-bar">
            <p className="search-summary mb-0">{briefSummary(b) || "Add the date, guests and layout to search."}<span className="small muted"> · Searching saves any changes.</span></p>
            <SubmitButton pendingLabel="Searching venues…">Search venues</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
