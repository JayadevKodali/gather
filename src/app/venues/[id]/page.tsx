import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Notices } from "@/components/Notice";
import { VenueImage } from "@/components/VenueImage";
import { requirePageRole } from "@/lib/auth/session";
import { isSearchable, type ConfirmedBrief } from "@/lib/brief/schema";
import { getDb } from "@/lib/db";
import { ACCESSIBILITY_CODES, FACILITY_CODES, FACILITY_LABELS, FACILITY_STATE_LABELS, LAYOUT_LABELS, PRICING_LABELS, type FacilityCode } from "@/lib/domain";
import { formatPounds, longDate } from "@/lib/format";
import { whyItFits } from "@/lib/matching/card";
import { FacilityIcon } from "@/components/FacilityIcon";
import { listPhotos } from "@/lib/services/photos";
import { venueGallery } from "@/lib/gallery";
import { VenueGallery } from "@/components/VenueGallery";
import { hardRuleFailures } from "@/lib/matching/eligibility";
import { estimate } from "@/lib/matching/pricing";
import { buildReasons, scoreVenue } from "@/lib/matching/score";
import { getBrief } from "@/lib/services/briefs";
import { getFacilities, getListing, loadMatchVenues } from "@/lib/services/listings";
import { enquireAction } from "../../actions/planner";
import { orNotFound } from "@/lib/services/page-guard";
import { InfoTip } from "@/components/InfoTip";
import { SubmitButton } from "@/components/SubmitButton";
import { BriefStrip } from "@/components/BriefStrip";
import { briefSummary } from "@/lib/brief-summary";

/** The browser tab shows the venue's name (published listings only; anything else stays "Venue"). */
export async function generateMetadata({ params }: PageProps<"/venues/[id]">): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(await getDb(), id);
  return { title: listing?.is_published ? listing.name : "Venue" };
}

export default async function VenuePage({ params, searchParams }: PageProps<"/venues/[id]">) {
  const actor = await requirePageRole("planner");
  const { id } = await params;
  const query = await searchParams;
  const db = await getDb();
  // Readable alias: /venues/v01-loom-room → the listing's own page (published listings only).
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    const [row] = await db.query<{ id: string }>("select id from listings where slug = $1 and is_published", [id]);
    if (!row) notFound();
    redirect(`/venues/${row.id}`);
  }
  const listing = await orNotFound(getListing(db, id));
  if (!listing || !listing.is_published) notFound();
  const facilities = await getFacilities(db, id);
  // Owner uploads first; otherwise the seeded cover and alternates; otherwise the drawn fallback.
  const gallery = venueGallery(listing.slug, listing.name, await listPhotos(db, id));
  const briefId = typeof query.brief === "string" ? query.brief : null;
  const brief = briefId ? await orNotFound(getBrief(db, actor, briefId)) : null;
  const confirmed = brief && isSearchable(brief.confirmed) ? (brief.confirmed as ConfirmedBrief) : null;
  const [venue] = await loadMatchVenues(db, [id]);
  const failures = confirmed && venue ? hardRuleFailures(venue, confirmed) : [];
  const est = confirmed && venue ? estimate(venue, confirmed, confirmed.guests) : null;
  let why: string | null = null;
  if (confirmed && venue && failures.length === 0) {
    const scored = scoreVenue(venue, confirmed);
    why = whyItFits({ venue, ...scored, reasons: buildReasons(venue, confirmed, scored.estimate) }, confirmed);
  }
  const essentials = new Set(confirmed ? Object.entries(confirmed.facilities).filter(([, l]) => l === "essential").map(([c]) => c) : []);

  const state = (c: FacilityCode) => facilities[c]?.state ?? "unknown";
  const included = FACILITY_CODES.filter((c) => !ACCESSIBILITY_CODES.includes(c) && state(c) === "yes" && facilities[c]?.charge === "included");
  const extras = FACILITY_CODES.filter((c) => state(c) === "yes" && facilities[c]?.charge !== "included");
  const notOffered = FACILITY_CODES.filter((c) => !ACCESSIBILITY_CODES.includes(c) && state(c) !== "yes");
  const price = `${formatPounds(listing.price_pence)}${listing.pricing_model === "per_head" ? " per head" : ""}`;

  return (
    <>
    {brief && <BriefStrip summary={briefSummary(brief.confirmed)} editHref={`/plan/${brief.id}#details`} />}
    <div className="wrap venue-page">
      {brief && <p className="back-link"><Link href={`/plan/${brief.id}/results`}><span aria-hidden="true">←</span> Back to your shortlist</Link></p>}
      <Notices params={query} />

      {gallery.length > 0 ? (
        <VenueGallery items={gallery} name={listing.name} />
      ) : (
        <div className="venue-hero">
          <VenueImage slug={listing.slug} name={listing.name} type={listing.venue_type} sizes="(max-width: 1200px) 100vw, 1160px" preload />
        </div>
      )}

      <div className="split">
        <section>
          <div className="venue-title">
            <h1>{listing.name}</h1>
            <p className="lead mb-0">{listing.venue_type} in {listing.neighbourhood ? `${listing.neighbourhood}, ` : ""}{listing.borough}</p>
          </div>

          <dl className="fact-row">
            {(["standing", "seated", "mixed"] as const).map((layout) => {
              const cap = layout === "standing" ? listing.capacity_standing : layout === "seated" ? listing.capacity_seated : listing.capacity_mixed;
              return (
                <div key={layout}>
                  <dt>{LAYOUT_LABELS[layout].split(" ")[0]}{confirmed?.layout === layout ? " (your layout)" : ""}</dt>
                  <dd className="num">{cap ?? "Not offered"}</dd>
                </div>
              );
            })}
            <div>
              <dt>{PRICING_LABELS[listing.pricing_model]}</dt>
              <dd className="num">{price}</dd>
            </div>
          </dl>

          {listing.description && <p>{listing.description}</p>}

          <section className="detail-section" aria-labelledby="access">
            <h2 id="access">Accessibility</h2>
            <ul className="tick-list icon-list">
              {ACCESSIBILITY_CODES.map((c) => (
                <li key={c} className={state(c) === "yes" ? "" : "no"}><FacilityIcon code={c} />{FACILITY_LABELS[c]}: {FACILITY_STATE_LABELS[state(c)].toLowerCase()}</li>
              ))}
            </ul>
            {listing.access_notes && <p className="mt-s mb-0"><strong>From the venue:</strong> {listing.access_notes}</p>}
          </section>

          <section className="detail-section" aria-labelledby="included">
            <h2 id="included">Included</h2>
            {included.length ? <ul className="tick-list icon-list">{included.map((c) => <li key={c}><FacilityIcon code={c} />{FACILITY_LABELS[c]}</li>)}</ul> : <p className="muted mb-0">The venue hasn’t confirmed any included facilities yet.</p>}
          </section>

          <section className="detail-section" aria-labelledby="extras">
            <h2 id="extras">Priced extras</h2>
            {extras.length ? (
              <table>
                <tbody>
                  {extras.map((c) => (
                    <tr key={c}>
                      <td>{FACILITY_LABELS[c]}{essentials.has(c) ? " (you marked this essential)" : ""}</td>
                      <td className="right num">{facilities[c]?.charge === "priced" ? formatPounds(facilities[c]?.pricePence ?? 0) : "Price to confirm"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted mb-0">No priced extras listed.</p>}
          </section>

          <details className="disclosure mt-s">
            <summary>Not offered or not confirmed ({notOffered.length})</summary>
            <div className="inner">
              <ul className="tick-list icon-list">{notOffered.map((c) => <li key={c} className="no"><FacilityIcon code={c} />{FACILITY_LABELS[c]}: {FACILITY_STATE_LABELS[state(c)].toLowerCase()}</li>)}</ul>
              <p className="tiny mb-0">“Not confirmed” counts as not available when you mark something essential. Photos are illustrative and aren’t used to decide anything.</p>
            </div>
          </details>
        </section>

        <aside className="panel enquire-panel" aria-labelledby="enquire">
          <h2 id="enquire">Send an enquiry</h2>
          {!confirmed ? (
            <p className="muted mb-0">Start from a brief so the venue gets your date, numbers and needs. <Link href="/plan">Describe your event</Link>.</p>
          ) : failures.length > 0 ? (
            <div className="notice error mb-0">This venue doesn’t fit your brief any more ({failures.map((f) => f.code.replace(/_/g, " ")).join(", ")}). <Link href={`/plan/${brief!.id}/results`}>See your current shortlist</Link>.</div>
          ) : (
            <form action={enquireAction}>
              <input type="hidden" name="briefId" value={brief!.id} />
              <input type="hidden" name="listingId" value={listing.id} />
              <p className="mb-0"><strong>{confirmed.guests} {LAYOUT_LABELS[confirmed.layout].toLowerCase()}</strong> on <strong>{longDate(confirmed.date)}</strong></p>
              {why && <p className="card-why mt-s">{why}</p>}
              {est && (
                <p className="small">Estimate <strong className="num">{est.totalPence === null ? "to confirm" : formatPounds(est.totalPence)}</strong> ({est.basis}{est.lines.length > 1 ? " + extras you need" : ""}). The venue confirms the final price in its quote.</p>
              )}
              {extras.length > 0 && (
                <fieldset>
                  <legend>Add priced extras</legend>
                  {extras.map((code) => {
                    const required = essentials.has(code);
                    const f = facilities[code]!;
                    return (
                      <label key={code} className="choice" style={{ display: "flex", marginBottom: 8, borderRadius: 12 }}>
                        <input type="checkbox" name="extras" value={code} defaultChecked={required} disabled={required} />
                        {required && <input type="hidden" name="extras" value={code} />}
                        <span>{FACILITY_LABELS[code]}: {f.charge === "priced" ? formatPounds(f.pricePence ?? 0) : "price to confirm"}{required ? " (essential)" : ""}</span>
                      </label>
                    );
                  })}
                </fieldset>
              )}
              <div className="field">
                <div className="label-row"><label htmlFor="message">Message to the venue</label><InfoTip id="message-hint">Optional. Timings, set-up, questions.</InfoTip></div>
                <textarea id="message" aria-describedby="message-hint" name="message" maxLength={2000} />
              </div>
              <SubmitButton style={{ width: "100%" }} pendingLabel="Sending enquiry…">Send enquiry</SubmitButton>
            </form>
          )}
        </aside>
      </div>
    </div>
    </>
  );
}
