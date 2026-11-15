import type { Metadata } from "next";
import Link from "next/link";
import { Notices } from "@/components/Notice";
import { VenueImage } from "@/components/VenueImage";
import { coverPhotoIds } from "@/lib/services/photos";
import { requirePageRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { PRICING_LABELS } from "@/lib/domain";
import { formatPounds } from "@/lib/format";
import { listOwnerListings } from "@/lib/services/listings";
import { togglePublishedAction } from "../actions/owner";
import { SubmitButton } from "@/components/SubmitButton";
import { StatusPill } from "@/components/StatusPill";
import { setupProgress } from "@/lib/listing-setup";
import { venuePhoto } from "@/lib/venue-images";

export const metadata: Metadata = { title: "Manage listings" };

export default async function OwnerHome({ searchParams }: PageProps<"/owner">) {
  const actor = await requirePageRole("owner");
  const params = await searchParams;
  const db = await getDb();
  const listings = await listOwnerListings(db, actor);
  const covers = await coverPhotoIds(db, listings.map((l) => l.id));
  const pending = listings.reduce((n, l) => n + l.pending, 0);
  // Drafts show how far setup has got (Phase 4), worked out from what's saved.
  const drafts = listings.filter((l) => !l.is_published).map((l) => l.id);
  const withFacilities = new Set(drafts.length
    ? (await db.query<{ listing_id: string }>("select distinct listing_id from listing_facilities where listing_id = any($1::uuid[])", [drafts])).map((r) => r.listing_id)
    : []);
  return (
    <div className="wrap">
      <div className="page-head">
        <div className="page-head-text">
          <h1>Manage listings</h1>
          <p className="muted mb-0">{pending > 0 ? <Link href="/enquiries">{pending} enquir{pending === 1 ? "y needs" : "ies need"} a reply</Link> : "No enquiries waiting for a reply."}</p>
        </div>
        <Link className="btn" href="/owner/listings/new">Add a listing</Link>
      </div>
      <Notices params={params} />
      {listings.length === 0 ? (
        <div className="panel"><h2>Add your first space</h2><p>One listing per bookable space. You can manage several from this account.</p><Link className="btn" href="/owner/listings/new">Add a listing</Link></div>
      ) : (
        <div className="results">
          {listings.map((l) => {
            const ready = l.is_published && l.open_days > 0;
            const setup = l.is_published ? null : setupProgress({ facilitiesSaved: withFacilities.has(l.id), hasPhoto: covers.has(l.id) || venuePhoto(l.slug) !== null, openDays: l.open_days, published: false });
            return (
              <article key={l.id} className="venue-card">
                <div className="card-media"><VenueImage slug={l.slug} name={l.name} type={l.venue_type} sizes="(max-width: 900px) 100vw, 560px" coverId={covers.get(l.id)} /></div>
                <div className="card-body">
                  <div className="spread">
                    <h3><Link href={`/owner/listings/${l.id}`}>{l.name}</Link></h3>
                    <StatusPill tone={!l.is_published ? "amber" : ready ? "green" : "amber"}>{setup ? `Draft: ${setup.doneCount} of ${setup.total} steps done` : ready ? "Live" : "Live, but no open dates"}</StatusPill>
                  </div>
                  <p className="card-sub">{!l.is_published ? "Hidden from planners · " : ready ? "Shown in planner searches · " : ""}{l.venue_type} · {l.neighbourhood ? `${l.neighbourhood}, ` : ""}{l.borough} · {PRICING_LABELS[l.pricing_model]} {formatPounds(l.price_pence)}</p>
                  <p className="small mb-0">Standing {l.capacity_standing ?? "—"} · Seated {l.capacity_seated ?? "—"} · Mixed {l.capacity_mixed ?? "—"}</p>
                  {/* Numbers at a glance: green when there are bookings, amber when enquiries wait; zero stays plain. */}
                  <ul className="count-pills" aria-label="At a glance">
                    <li><StatusPill tone="neutral">{l.open_days} upcoming open day{l.open_days === 1 ? "" : "s"}</StatusPill></li>
                    <li>{l.bookings > 0 ? <StatusPill tone="green">{l.bookings} booking{l.bookings === 1 ? "" : "s"}</StatusPill> : <span className="count-plain">0 bookings</span>}</li>
                    <li>{l.pending > 0 ? <Link href="/enquiries" className="pill-link"><StatusPill tone="amber">{l.pending} enquir{l.pending === 1 ? "y" : "ies"} waiting</StatusPill></Link> : <span className="count-plain">0 enquiries waiting</span>}</li>
                  </ul>
                  {setup && setup.needed.length > 0 && (
                    <p className="notice info small setup-needed">Still to do: {setup.needed.join("; ")}.</p>
                  )}
                  <div className="actions">
                    {setup
                      ? <Link className="btn small" href={`/owner/listings/${l.id}?step=${setup.resume}`}>Continue setup</Link>
                      : <Link className="btn small" href={`/owner/listings/${l.id}`}>Edit listing</Link>}
                    <Link className="btn secondary small" href={`/owner/listings/${l.id}/calendar`}>Dates and calendar</Link>
                    <form action={togglePublishedAction}>
                      <input type="hidden" name="listingId" value={l.id} /><input type="hidden" name="publish" value={l.is_published ? "0" : "1"} />
                      <SubmitButton className="btn quiet small" pendingLabel="Saving…">{l.is_published ? "Hide from searches" : "Show in planner searches"}</SubmitButton>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
