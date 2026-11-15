/** The Photos panel on an owner's listing page: upload, preview, cover, reorder, replace, remove. */
import Image from "next/image";
import { photoAction } from "@/app/actions/owner";
import { MAX_PHOTOS } from "@/lib/photos/process";
import { photoSrcSet, photoUrl, type PhotoRow } from "@/lib/services/photos";
import { VENUE_ALTERNATES } from "@/lib/venue-gallery";
import { venuePhoto } from "@/lib/venue-images";
import { PhotoPicker } from "./PhotoPicker";
import { SubmitButton } from "./SubmitButton";
import { UploadForm } from "./UploadForm";
import { StatusPill } from "@/components/StatusPill";
import { SortablePhotos } from "./SortablePhotos";

export function PhotoManager({ listingId, slug, name, published, photos, available, step }: {
  listingId: string; slug: string; name: string; published: boolean; photos: PhotoRow[]; available: { ok: true } | { ok: false; reason: string };
  /** On a setup step (Phase 4), every photo form comes back to the same step. */
  step?: string;
}) {
  const stepField = step ? <input type="hidden" name="step" value={step} /> : null;
  const seed = venuePhoto(slug);
  const remaining = MAX_PHOTOS - photos.length;
  const lastLive = published && !seed && photos.length === 1;
  return (
    <section className="panel" id="photos" aria-labelledby="photos-title">
      <div className="spread">
        <h2 id="photos-title" className="mb-0">Photos</h2>
        <span className="small muted">{photos.length} of {MAX_PHOTOS}</span>
      </div>
      <p className="small muted">
        {seed && photos.length === 0
          ? "These are the listing’s original photos. Upload your own to replace them: your first upload becomes the cover."
          : "The first photo is the cover planners see in search results. You need at least one photo to publish."}
      </p>
      {!available.ok && <div className="notice info" role="status">Photo uploads aren’t available on this deployment yet. {available.reason}</div>}

      {seed && photos.length === 0 && <ul className="photo-grid">
        {seed && photos.length === 0 && [seed, ...(VENUE_ALTERNATES[slug] ?? [])].map((img, i) => (
          <li key={img.src} className="photo-item">
            <div className="photo-frame"><Image src={img.src} alt={img.alt} fill sizes="240px" /></div>
            {i === 0 ? <StatusPill tone="green">Cover</StatusPill> : <span className="tiny muted">Photo {i + 1}</span>}
            <p className="tiny muted mb-0">Original photo</p>
          </li>
        ))}
      </ul>}
      {photos.length > 0 && <SortablePhotos key={photos.map((p) => p.id).join(",")} listingId={listingId} step={step} items={photos.map((p, i) => {
          const isCover = i === 0;
          return { id: p.id, label: `photo ${i + 1}`, content: (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- served by /photos with its own responsive sizes */}
              <div className="photo-frame"><img src={photoUrl(p.id, 480)} srcSet={photoSrcSet(p.id)} sizes="240px" alt={`${name}, photo ${i + 1}`} loading="lazy" /></div>
              {/* Tidy rows: arrows and Make cover, then Replace and Remove (fix 2). */}
              <div className="tile-actions">
                {isCover && <StatusPill tone="green" className="cover-slot">Cover</StatusPill>}
                <form action={photoAction} className="photo-actions">
                  <input type="hidden" name="listingId" value={listingId} />
                  <input type="hidden" name="photoId" value={p.id} />
                  {isCover && <input type="hidden" name="wasCover" value="1" />}
                  {stepField}
                  <span className="move-arrows">
                    <SubmitButton className="btn icon-round" name="op" value="left" disabled={i === 0} data-move={`${p.id}:left`}
                      aria-label={`Move photo ${i + 1} up the order`} title={`Move photo ${i + 1} up the order`}><ArrowIcon /></SubmitButton>
                    <SubmitButton className="btn icon-round" name="op" value="right" disabled={i === photos.length - 1} data-move={`${p.id}:right`}
                      aria-label={`Move photo ${i + 1} down the order`} title={`Move photo ${i + 1} down the order`}><ArrowIcon down /></SubmitButton>
                  </span>
                  {!isCover && <SubmitButton className="btn small secondary make-cover" name="op" value="cover" pendingLabel="Saving…">Make cover</SubmitButton>}
                  <SubmitButton className="btn small danger remove-photo" name="op" value="remove" disabled={lastLive} title={lastLive ? "A live listing needs at least one photo" : undefined} aria-label={`Remove photo ${i + 1}`} pendingLabel="Removing…">Remove</SubmitButton>
                </form>
                {available.ok && (
                  <details className="photo-replace">
                    <summary className="small">Replace</summary>
                    <UploadForm action={`/api/listings/${listingId}/photos`} label="Replace photo" className="btn small">
                      <input type="hidden" name="replace" value={p.id} />
                      {stepField}
                      <PhotoPicker inputId={`replace-${p.id}`} remaining={1} multiple={false} label="New photo" />
                    </UploadForm>
                  </details>
                )}
              </div>
            </>
          ) };
        })} />}
      {lastLive && <p className="tiny muted">This is the only photo of a live listing, so it can’t be removed. Add another photo first, or unpublish the listing.</p>}

      {available.ok && remaining > 0 && (
        <UploadForm action={`/api/listings/${listingId}/photos`} label="Upload photos" formClassName="stack photo-upload">
          {stepField}
          <PhotoPicker inputId="photos-input" remaining={remaining} label={photos.length ? "Add photos" : seed ? "Upload your own photos" : "Add your first photos"} />
        </UploadForm>
      )}
      {remaining <= 0 && <p className="small muted mb-0">You’ve added the maximum of {MAX_PHOTOS} photos. Remove or replace one to change them.</p>}
    </section>
  );
}

/** One arrow, drawn pointing left (or right with `down`); turned to point up / down when the photos stack in one column. */
function ArrowIcon({ down = false }: { down?: boolean }) {
  return (
    <svg className={`move-arrow ${down ? "next" : ""}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" /><path d="m11 6-6 6 6 6" />
    </svg>
  );
}
