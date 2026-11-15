import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notices } from "@/components/Notice";
import { Motion } from "@/components/Motion";
import { VenueImage } from "@/components/VenueImage";
import { coverPhotoIds } from "@/lib/services/photos";
import { requirePageRole } from "@/lib/auth/session";
import { noneNearArea, plainArea } from "@/lib/areas";
import { getDb } from "@/lib/db";
import { EVENT_TYPE_LABELS, FACILITY_LABELS, FACILITY_SHORT, type FacilityCode } from "@/lib/domain";
import { formatPounds } from "@/lib/format";
import { capacityText, priceText, upfrontAmenityCodes, whyItFits } from "@/lib/matching/card";
import { FacilityIcon } from "@/components/FacilityIcon";
import type { ShortlistSort } from "@/lib/matching/types";
import { currentShortlist } from "@/lib/services/briefs";
import { orNotFound } from "@/lib/services/page-guard";
import { BriefStrip } from "@/components/BriefStrip";
import { briefSummary } from "@/lib/brief-summary";

export const metadata: Metadata = { title: "Your shortlist" };

const SORTS: [ShortlistSort, string][] = [["match", "Best match"], ["price-asc", "Price: low to high"], ["price-desc", "Price: high to low"]];

export default async function ResultsPage({ params, searchParams }: PageProps<"/plan/[id]/results">) {
  const actor = await requirePageRole("planner");
  const { id } = await params;
  const query = await searchParams;
  const sort = (SORTS.find(([s]) => s === query.sort)?.[0] ?? "match") as ShortlistSort;
  const db = await getDb();
  const result = await orNotFound(currentShortlist(db, actor, id, sort));
  if (!result) redirect(`/plan/${id}`);
  const { brief, outcome } = result;
  const covers = await coverPhotoIds(db, outcome.shortlist.map((m) => m.venue.id));
  const b = brief.confirmed as NonNullable<typeof brief.confirmed> & { date: string; guests: number; layout: "standing" | "seated" | "mixed" };
  // Shown above the cards only; eligibility, scoring and order are unchanged.
  const allElsewhere = noneNearArea(b.boroughs, outcome.shortlist.map((m) => m.venue.borough));
  const areaLabel = (b.areaText && plainArea(b.areaText)) || b.boroughs.join(" or ");
  const essentials = Object.entries(b.facilities).filter(([, l]) => l === "essential").map(([c]) => FACILITY_LABELS[c as FacilityCode]);

  return (
    <>
    <BriefStrip summary={briefSummary(b)} editHref={`/plan/${id}#details`} />
    <div className="wrap">
      <Motion />
      <div className="page-head">
        <div>
          <h1>{outcome.shortlist.length ? `${outcome.shortlist.length} ${outcome.shortlist.length > 1 ? "venues that fit" : "venue that fits"}` : "No venue fits yet"}</h1>
          {/* The date, numbers, area and budget are in the strip above; here only what the strip doesn't say. */}
          {(b.eventType || essentials.length > 0) && (
            <p className="muted mb-0">
              {b.eventType ? EVENT_TYPE_LABELS[b.eventType] : ""}{b.eventType && essentials.length ? ". " : ""}
              {essentials.length ? `Must have: ${essentials.join(", ")}` : ""}.
            </p>
          )}
        </div>
        <Link className="btn secondary" href={`/plan/${id}#details`}>Edit details</Link>
      </div>
      <Notices params={query} />

      {outcome.shortlist.length === 0 ? (
        <section className="panel">
          <h2>Nothing matches every requirement on that date</h2>
          <p>We only show venues that have confirmed your date, can hold {b.guests} {b.layout === "mixed" ? "in a mixed layout" : b.layout}, have every essential and fit a strict budget. We won’t loosen any of those without you.</p>
          {outcome.suggestions.length > 0 && (
            <ul>{outcome.suggestions.map((s) => <li key={s}>{s}</li>)}</ul>
          )}
          <Link className="btn" href={`/plan/${id}#details`}>Change the date, layout or must-haves</Link>
        </section>
      ) : (
        <>
          {allElsewhere && <p className="notice info">Nothing that fits is near {areaLabel}. These venues are elsewhere in London.</p>}
          <nav className="sort-bar" aria-label="Sort shortlist">
            <span className="small muted">Sort</span>
            <div className="sort-pills">
              {SORTS.map(([s, label]) => (
                <Link key={s} href={`/plan/${id}/results?sort=${s}`} className={`sort-pill ${s === sort ? "on" : ""}`} aria-current={s === sort ? "true" : undefined}>{label}</Link>
              ))}
            </div>
            <span className="tiny">Sorting reorders this shortlist. It never adds a venue that failed a requirement.</span>
          </nav>
          <div className="results">
            {outcome.shortlist.map((m, index) => {
              const v = m.venue;
              const extras = Object.entries(v.facilities).filter(([, f]) => f?.state === "yes" && f.charge !== "included");
              const amenities = upfrontAmenityCodes(m, b);
              const confirmed = Object.entries(v.facilities).filter(([, f]) => f?.state === "yes");
              return (
                <article key={v.id} className="venue-card" aria-labelledby={`venue-${v.id}`}>
                  <div className="card-media" data-reveal style={{ "--i": index } as React.CSSProperties}>
                    <VenueImage slug={v.slug} name={v.name} type={v.venueType} sizes="(max-width: 900px) 100vw, 560px" preload={index < 2} coverId={covers.get(v.id)} />
                    {sort === "match" && <span className="card-rank">{index === 0 ? "Best match" : `Match #${index + 1}`}</span>}
                  </div>
                  <div className="card-body">
                    <h3 id={`venue-${v.id}`}>{v.name}</h3>
                    <p className="card-sub">{v.venueType} · {v.neighbourhood ? `${v.neighbourhood}, ` : ""}{v.borough}</p>
                    <p className="card-key num"><strong>{capacityText(m, b)}</strong><span className="price">{priceText(m)}</span></p>
                    <p className="card-why"><b>Why it fits:</b> {whyItFits(m, b)}</p>
                    {amenities.length > 0 && (
                      <ul className="amenities" aria-label="Confirmed amenities">{amenities.map((c) => <li key={c}><FacilityIcon code={c} />{FACILITY_SHORT[c]}</li>)}</ul>
                    )}
                    <details className="card-more">
                      <summary>Full reasons, facilities and extras</summary>
                      <div className="inner">
                        <ul className="reasons" aria-label="Why it matches">{m.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                        {extras.length > 0 && <p className="small"><strong>Priced extras:</strong> {extras.map(([c, f]) => `${FACILITY_LABELS[c as FacilityCode]} (${f!.charge === "priced" ? formatPounds(f!.pricePence ?? 0) : "price to confirm"})`).join("; ")}</p>}
                        <p className="small"><strong>Confirmed by the venue:</strong> {confirmed.map(([c]) => FACILITY_LABELS[c as FacilityCode]).join(", ") || "nothing yet"}.</p>
                        <p className="tiny mb-0">Match score {m.score}/100. Anything not listed is not confirmed by the venue. Photos are illustrative.</p>
                      </div>
                    </details>
                    <div className="card-actions">
                      <span className="card-estimate">{m.estimate.totalPence === null ? <span className="small muted">Price to confirm</span> : <><span className="tiny">Estimate</span><span className="price-tag num">{formatPounds(m.estimate.totalPence)}</span></>}</span>
                      <Link className="btn" href={`/venues/${v.id}?brief=${id}`} aria-label={`View and enquire: ${v.name}`}>View and enquire</Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {outcome.suggestions.length > 0 && <p className="small muted mt-m">Want more choice? {outcome.suggestions.join(" ")}</p>}
        </>
      )}
    </div>
    </>
  );
}
