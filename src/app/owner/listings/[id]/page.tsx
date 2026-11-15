import type { Metadata } from "next";
import Link from "next/link";
import { ListingForm } from "@/components/ListingForm";
import { Notices } from "@/components/Notice";
import { requirePageRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { AV_HELP, FACILITY_GROUPS } from "@/lib/domain";
import { poundsInput } from "@/lib/format";
import { FacilityIcon } from "@/components/FacilityIcon";
import { PhotoManager } from "@/components/PhotoManager";
import { getFacilities, getOwnedListing, type ListingRow } from "@/lib/services/listings";
import { listPhotos, photoUploadsAvailable } from "@/lib/services/photos";
import { venuePhoto } from "@/lib/venue-images";
import { saveFacilitiesAction, togglePublishedAction, updateListingAction } from "../../../actions/owner";
import { orNotFound } from "@/lib/services/page-guard";
import { SubmitButton } from "@/components/SubmitButton";
import { StatusPill } from "@/components/StatusPill";
import { SetupSteps } from "@/components/SetupSteps";
import { isSetupStep, nextStep, setupProgress, SETUP_STEPS, type SetupStepKey } from "@/lib/listing-setup";

export const metadata: Metadata = { title: "Edit listing" };

export default async function EditListingPage({ params, searchParams }: PageProps<"/owner/listings/[id]">) {
  const actor = await requirePageRole("owner");
  const { id } = await params;
  const query = await searchParams;
  const db = await getDb();
  const listing = await orNotFound(getOwnedListing(db, actor, id));
  const facilities = await getFacilities(db, id);
  const photos = await listPhotos(db, id);
  const [{ open }] = await db.query<{ open: number }>("select count(*)::int as open from listing_days where listing_id = $1 and state = 'open' and day >= current_date", [id]);
  const hasPhoto = photos.length > 0 || venuePhoto(listing.slug) !== null;
  // A draft is set up in five steps, one at a time (Phase 4). "?step=all" shows everything on one page.
  const setup = setupProgress({ facilitiesSaved: Object.keys(facilities).length > 0, hasPhoto, openDays: open, published: listing.is_published });
  if (!listing.is_published && query.step !== "all") {
    const step: SetupStepKey = isSetupStep(query.step) ? query.step : setup.resume;
    const nx = nextStep(step);
    const next = nx ? { key: nx.key, label: nx.label } : undefined;
    const current = SETUP_STEPS.find((x) => x.key === step)!;
    return (
      <div className="wrap edit-listing setup" style={{ maxWidth: 920 }}>
        <p className="back-link"><Link href="/owner"><span aria-hidden="true">←</span> Manage listings</Link></p>
        <div className="page-head">
          <div className="page-head-text">
            <h1>{listing.name}</h1>
            <p className="page-summary">Setting up your listing: {setup.doneCount} of {setup.total} steps done. Planners can’t see it until you publish.</p>
          </div>
          <div className="page-head-actions">
            <StatusPill tone="amber">Draft</StatusPill>
            <Link className="btn quiet small" href="?step=all">Show everything on one page</Link>
          </div>
        </div>
        <SetupSteps steps={setup.steps} current={step} />
        <Notices params={query} />
        <h2 className="setup-title">Step {SETUP_STEPS.indexOf(current) + 1} of {setup.total}: {current.label}</h2>

        {step === "details" && <ListingForm listing={listing} action={updateListingAction} submitLabel="Save draft" step="details" next={next} />}
        {step === "facilities" && <FacilitiesForm id={id} facilities={facilities} step="facilities" next={next} />}
        {step === "photos" && (
          <>
            <PhotoManager listingId={id} slug={listing.slug} name={listing.name} published={false} photos={photos} available={photoUploadsAvailable()} step="photos" />
            <StepNav id={id} next={next} done={hasPhoto} note={hasPhoto ? undefined : "You can carry on and add photos later, but a listing needs one before it can be published."} />
          </>
        )}
        {step === "dates" && (
          <>
            <section className="panel" aria-labelledby="dates-title">
              <h2 id="dates-title" className="sr-only">Dates</h2>
              <p>{open > 0 ? `${open} upcoming open date${open === 1 ? "" : "s"}.` : "No open dates yet."} Planners only see this listing on the dates you open. Open dates one by one, or a whole range (for example every Friday and Saturday) in the calendar.</p>
              <div className="actions"><Link className="btn" href={`/owner/listings/${id}/calendar`}>Open the calendar</Link></div>
            </section>
            <StepNav id={id} next={next} done={open > 0} note={open > 0 ? undefined : "You can publish without open dates, but planners won’t find the listing until you open some."} />
          </>
        )}
        {step === "publish" && (
          <>
            <section className="panel review-steps" aria-labelledby="review-title">
              <h2 id="review-title" className="mb-0">Check before you publish</h2>
              <ul className="checklist">
                {setup.steps.filter((x) => x.key !== "publish").map((x) => (
                  <li key={x.key} className={x.done ? "done" : "todo"}>{x.label}{x.done ? "" : " (not done yet)"} · <Link href={`?step=${x.key}`}>{x.done ? "Change" : "Do this now"}</Link></li>
                ))}
              </ul>
            </section>
            <PublishPanel id={id} listing={listing} hasPhoto={hasPhoto} open={open} step="publish" />
          </>
        )}
      </div>
    );
  }

  const SECTIONS: [string, string][] = [["details", "Details"], ["prices", "Prices and extras"], ["facilities", "Facilities"], ["photos", "Photos"], ["dates", "Dates"], ["publish", "Publish"]];
  return (
    <div className="wrap edit-listing" style={{ maxWidth: 1120 }}>
      <p className="back-link"><Link href="/owner"><span aria-hidden="true">←</span> Manage listings</Link></p>
      <div className="page-head">
        <div className="page-head-text">
          <h1>{listing.name}</h1>
          <p className="page-summary">{listing.is_published ? "Live: planners can find this listing on your open dates." : "Draft: planners can’t see this listing yet."}</p>
        </div>
        <div className="page-head-actions">
          <StatusPill tone={listing.is_published ? "green" : "amber"}>{listing.is_published ? "Live" : "Draft"}</StatusPill>
          <Link className="btn secondary" href={`/owner/listings/${id}/calendar`}>Dates and calendar</Link>
        </div>
      </div>
      <Notices params={query} />

      <div className="edit-layout">
        <nav className="section-menu" aria-label="Sections of this listing">
          <ol>{SECTIONS.map(([sid, label], n) => <li key={sid}><a href={`#${sid}`}><span className="section-num" aria-hidden="true">{n + 1}</span>{label}</a></li>)}</ol>
        </nav>
        <div className="edit-sections">
      <ListingForm listing={listing} action={updateListingAction} submitLabel="Save changes" hint={listing.is_published ? "Changes show to planners straight away." : undefined} sections />

      <FacilitiesForm id={id} facilities={facilities} />

      <PhotoManager listingId={id} slug={listing.slug} name={listing.name} published={listing.is_published} photos={photos} available={photoUploadsAvailable()} />

      <section className="panel" id="dates" aria-labelledby="dates-title">
        <h2 id="dates-title">Dates</h2>
        <p className="mb-0">{open > 0 ? `${open} upcoming open date${open === 1 ? "" : "s"}. Planners only see this listing on the dates you open.` : "No open dates yet. Planners only see this listing on the dates you open."}</p>
        <div className="actions mt-m"><Link className="btn secondary" href={`/owner/listings/${id}/calendar`}>Open the calendar</Link></div>
      </section>

      <PublishPanel id={id} listing={listing} hasPhoto={hasPhoto} open={open} />
        </div>
      </div>
    </div>
  );
}

function FacilitiesForm({ id, facilities, step, next }: { id: string; facilities: Awaited<ReturnType<typeof getFacilities>>; step?: string; next?: { key: string; label: string } }) {
  return (
    <form action={saveFacilitiesAction} className="panel" id="facilities">
      <input type="hidden" name="listingId" value={id} />
      {step && <input type="hidden" name="step" value={step} />}
      <h2 className={step ? "sr-only" : undefined}>Facilities and extras</h2>
      <p className="small muted">Planners who mark something Essential only see venues where it’s Available. “Not confirmed” counts as not available for them, so confirm what you can. For anything you charge for, choose Priced and add the per-event price.</p>
      {FACILITY_GROUPS.map((group, gi) => {
        const available = group.items.filter(([code]) => facilities[code]?.state === "yes").length;
        const unconfirmed = group.items.filter(([code]) => (facilities[code]?.state ?? "unknown") === "unknown").length;
        return (
        <details key={group.name} className="disclosure facility-group fac-edit" open={gi === 0}>
          <summary><span className="fac-group-name">{group.name}</span><span className="group-count">{available} of {group.items.length} available{unconfirmed ? ` · ${unconfirmed} not confirmed` : ""}</span></summary>
          <div className="inner">
          {group.name === "Event technology" && <p className="small muted">{AV_HELP}</p>}
          <div className="table-scroll" role="region" aria-label={`${group.name} (scrolls sideways on small screens)`} tabIndex={0}>
            <table className="fac-table">
              <thead><tr><th>Facility</th><th>Status</th><th>Charge</th><th>Price (£)</th><th>Note</th></tr></thead>
              <tbody>
                {group.items.map(([code, label]) => {
                  const f = facilities[code];
                  return (
                    <tr key={code}>
                      <td><label htmlFor={`state_${code}`} style={{ fontWeight: 500, margin: 0, display: "flex", gap: 8, alignItems: "center" }}><FacilityIcon code={code} />{label}</label></td>
                      <td>
                        <select id={`state_${code}`} name={`state_${code}`} defaultValue={f?.state ?? "unknown"}>
                          <option value="yes">Available</option><option value="no">Unavailable</option><option value="unknown">Not confirmed</option>
                        </select>
                      </td>
                      <td>
                        <select name={`charge_${code}`} aria-label={`${label}: charge`} defaultValue={f?.charge ?? "included"}>
                          <option value="included">Included</option><option value="priced">Priced extra</option><option value="to_confirm">Price to confirm</option>
                        </select>
                      </td>
                      <td><input name={`price_${code}`} aria-label={`${label}: price`} type="text" inputMode="decimal" defaultValue={poundsInput(f?.pricePence)} /></td>
                      <td><input name={`note_${code}`} aria-label={`${label}: note`} type="text" defaultValue={f?.note ?? ""} placeholder="e.g. 2 handheld mics" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
        </details>
        );
      })}
      <div className="actions mt-m">
        {next ? (
          <>
            <SubmitButton name="goto" value={next.key} pendingLabel="Saving…">{`Next: ${next.label}`}</SubmitButton>
            <SubmitButton className="btn secondary" pendingLabel="Saving…">Save facilities</SubmitButton>
          </>
        ) : <SubmitButton pendingLabel="Saving…">Save facilities</SubmitButton>}
      </div>
    </form>
  );
}

function PublishPanel({ id, listing, hasPhoto, open, step }: { id: string; listing: ListingRow; hasPhoto: boolean; open: number; step?: string }) {
  return (
    <section id="publish" className={`panel publish-panel ${listing.is_published ? "live" : ""}`} aria-labelledby="status-title">
      <div className="spread">
        <div>
          <h2 id="status-title" className="mb-0">{listing.is_published ? "Live" : "Draft"}</h2>
          <p className="small muted mb-0 mt-s">{listing.is_published ? "Planners can find this listing on your open dates." : "Planners can’t see this listing yet."}</p>
        </div>
        <form action={togglePublishedAction}>
          <input type="hidden" name="listingId" value={id} />
          <input type="hidden" name="back" value="listing" />
          {step && <input type="hidden" name="step" value={step} />}
          <input type="hidden" name="publish" value={listing.is_published ? "0" : "1"} />
          {listing.is_published
            ? <SubmitButton className="btn secondary" pendingLabel="Unpublishing…">Unpublish</SubmitButton>
            : <SubmitButton disabled={!hasPhoto} aria-describedby="publish-checklist" pendingLabel="Publishing…">Publish listing</SubmitButton>}
        </form>
      </div>
      {!listing.is_published && (
        <ul className="checklist small" id="publish-checklist">
          <li className={hasPhoto ? "done" : "todo"}>{hasPhoto ? "Has a photo" : <><a href={step ? `?step=photos` : "#photos"}>Add at least one photo</a> (required to publish)</>}</li>
          <li className={open > 0 ? "done" : "todo"}>{open > 0 ? `${open} open dates` : <><Link href={`/owner/listings/${id}/calendar`}>Open the dates you can host</Link> (planners only see open dates)</>}</li>
        </ul>
      )}
    </section>
  );
}

/** Under a setup step that has no form of its own: go back, or on to the next step. */
function StepNav({ id, next, done, note }: { id: string; next?: { key: string; label: string }; done: boolean; note?: string }) {
  return (
    <div className="step-nav">
      {note && <p className="small muted mb-0">{note}</p>}
      <div className="actions">
        {next && <Link className={`btn ${done ? "" : "secondary"}`} href={`/owner/listings/${id}?step=${next.key}`}>Next: {next.label}</Link>}
      </div>
    </div>
  );
}
