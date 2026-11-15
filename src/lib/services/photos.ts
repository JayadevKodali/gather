/**
 * Venue photos uploaded by owners. Only the listing's owner can add, reorder, replace or remove them.
 *
 * Rules (all enforced here, on the server):
 *  - 1 to 6 photos per listing; the first is the cover. A draft can have none.
 *  - Publishing needs at least one photo (seeded venues already have theirs). An owner's uploads replace a
 *    seeded venue's original photos everywhere, and their first upload is the cover.
 *  - The last photo of a live listing can't be removed; add another first, or unpublish.
 *  - Photos of a draft are visible only to its owner and the admin; a live listing's photos are public.
 */
import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db";
import { photoStore } from "@/lib/adapters/photo-storage";
import { config } from "@/lib/config";
import { MAX_PHOTOS, PhotoError, processPhoto, SIZES, type PhotoSize } from "@/lib/photos/process";
import { venuePhoto } from "@/lib/venue-images";
import { conflict, forbidden, invalid, notFound, type Actor } from "./errors";
import { getOwnedListing } from "./listings";

export interface PhotoRow { id: string; listing_id: string; storage_key: string; width: number; height: number; bytes: number; position: number; created_at: Date }

const keyFor = (listingId: string, photoId: string, size: PhotoSize) => `listings/${listingId}/${photoId}/${size}.webp`;
const keysOf = (p: Pick<PhotoRow, "listing_id" | "id">) => SIZES.map((s) => keyFor(p.listing_id, p.id, s));
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export const hasSeedPhoto = (slug: string) => venuePhoto(slug) !== null;

export function photoUploadsAvailable(): { ok: true } | { ok: false; reason: string } {
  const p = config().photos;
  return p.kind === "unavailable" ? { ok: false, reason: p.reason } : { ok: true };
}

export async function listPhotos(db: Db, listingId: string): Promise<PhotoRow[]> {
  return db.query<PhotoRow>("select * from listing_photos where listing_id = $1 order by position, created_at", [listingId]);
}

/** True when a listing may be published: it has an uploaded photo, or a seeded one. */
export async function hasPublishablePhoto(db: Db, listing: { id: string; slug: string }) {
  if (hasSeedPhoto(listing.slug)) return true;
  const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from listing_photos where listing_id = $1", [listing.id]);
  return n > 0;
}

async function renumber(db: Db, listingId: string, orderedIds: string[]) {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) await tx.query("update listing_photos set position = $3 where id = $1 and listing_id = $2", [id, listingId, i]);
  });
}

export interface UploadFile { name: string; bytes: Buffer }

/** Adds photos (or replaces one, keeping its place). All files are checked before any is stored. */
export async function addPhotos(db: Db, actor: Actor | null, listingId: string, files: UploadFile[], replaceId?: string | null): Promise<number> {
  const listing = await getOwnedListing(db, actor, listingId);
  const store = photoStore();
  if (!store) throw invalid((photoUploadsAvailable() as { reason: string }).reason ?? "Photo uploads aren't available.");
  if (files.length === 0) throw invalid("Choose at least one photo to upload.");
  const existing = await listPhotos(db, listing.id);
  const replacing = replaceId ? existing.find((p) => p.id === replaceId) : null;
  if (replaceId && !replacing) throw notFound("That photo isn't on this listing.");
  if (replacing && files.length !== 1) throw invalid("Choose one photo to replace it with.");
  if (!replacing && existing.length + files.length > MAX_PHOTOS) {
    throw invalid(`A listing can have up to ${MAX_PHOTOS} photos. It has ${existing.length}, so you can add ${Math.max(0, MAX_PHOTOS - existing.length)} more.`);
  }

  const processed = [];
  for (const f of files) {
    try { processed.push(await processPhoto(f.bytes, f.name)); }
    catch (e) { if (e instanceof PhotoError) throw invalid(e.message); throw e; }
  }

  const added: string[] = [];
  let position = replacing ? replacing.position : existing.length;
  for (const p of processed) {
    const id = randomUUID();
    const keys: string[] = [];
    try {
      for (const v of p.variants) {
        const key = keyFor(listing.id, id, v.size);
        await store.put(key, v.data, "image/webp");
        keys.push(key);
      }
      await db.query(
        "insert into listing_photos (id, listing_id, storage_key, width, height, bytes, position) values ($1,$2,$3,$4,$5,$6,$7)",
        [id, listing.id, keyFor(listing.id, id, 1600), p.width, p.height, p.bytes, position++],
      );
      added.push(id);
    } catch (e) {
      await store.remove(keys).catch(() => {});
      throw e;
    }
  }
  if (replacing) {
    await db.query("delete from listing_photos where id = $1", [replacing.id]);
    await store.remove(keysOf(replacing)).catch(() => {}); // an orphaned file is harmless; the row is gone
  }
  await db.query("update listings set updated_at = now() where id = $1", [listing.id]);
  return added.length;
}

export async function setCover(db: Db, actor: Actor | null, listingId: string, photoId: string) {
  const listing = await getOwnedListing(db, actor, listingId);
  const photos = await listPhotos(db, listing.id);
  if (!photos.some((p) => p.id === photoId)) throw notFound("That photo isn't on this listing.");
  await renumber(db, listing.id, [photoId, ...photos.filter((p) => p.id !== photoId).map((p) => p.id)]);
}

export async function movePhoto(db: Db, actor: Actor | null, listingId: string, photoId: string, direction: -1 | 1) {
  const listing = await getOwnedListing(db, actor, listingId);
  const ids = (await listPhotos(db, listing.id)).map((p) => p.id);
  const i = ids.indexOf(photoId);
  if (i < 0) throw notFound("That photo isn't on this listing.");
  const j = i + direction;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await renumber(db, listing.id, ids);
}

/**
 * Drag to reorder (Phase 4): the owner sends the whole new order. It must be exactly this listing's photos,
 * each once; anything else is refused and nothing changes. The first becomes the cover.
 */
export async function reorderPhotos(db: Db, actor: Actor | null, listingId: string, orderedIds: string[]) {
  const listing = await getOwnedListing(db, actor, listingId);
  const ids = (await listPhotos(db, listing.id)).map((p) => p.id);
  const same = orderedIds.length === ids.length && new Set(orderedIds).size === orderedIds.length && orderedIds.every((id) => ids.includes(id));
  if (!same) throw invalid("The photos changed while you were moving them. Please try again.");
  await renumber(db, listing.id, orderedIds);
}

export async function removePhoto(db: Db, actor: Actor | null, listingId: string, photoId: string) {
  const listing = await getOwnedListing(db, actor, listingId);
  const photos = await listPhotos(db, listing.id);
  const photo = photos.find((p) => p.id === photoId);
  if (!photo) throw notFound("That photo isn't on this listing.");
  if (listing.is_published && photos.length === 1 && !hasSeedPhoto(listing.slug)) {
    throw conflict("This is the only photo of a live listing. Add another photo first, or unpublish the listing.");
  }
  await db.query("delete from listing_photos where id = $1", [photo.id]);
  await renumber(db, listing.id, photos.filter((p) => p.id !== photo.id).map((p) => p.id));
  await photoStore()?.remove(keysOf(photo)).catch(() => {});
}

/** For /photos/<id>/<size>: public for live listings; drafts only for their owner and the admin. */
export async function photoForViewing(db: Db, actor: Actor | null, photoId: string, size: number) {
  if (!isUuid(photoId) || !(SIZES as readonly number[]).includes(size)) throw notFound();
  const [p] = await db.query<PhotoRow & { is_published: boolean; owner_id: string }>(
    "select ph.*, l.is_published, l.owner_id from listing_photos ph join listings l on l.id = ph.listing_id where ph.id = $1", [photoId]);
  if (!p) throw notFound();
  if (!p.is_published && !(actor && (actor.role === "admin" || actor.id === p.owner_id))) throw forbidden();
  const store = photoStore();
  const data = store ? await store.get(keyFor(p.listing_id, p.id, size as PhotoSize)) : null;
  if (!data) throw notFound();
  return { data, isPublic: p.is_published };
}

/** Cover photo id (position 0) for each listing that has uploads. */
export async function coverPhotoIds(db: Db, listingIds: string[]): Promise<Map<string, string>> {
  if (listingIds.length === 0) return new Map();
  const rows = await db.query<{ listing_id: string; id: string }>(
    `select distinct on (listing_id) listing_id, id from listing_photos where listing_id = any($1::uuid[]) order by listing_id, position, created_at`,
    [listingIds],
  );
  return new Map(rows.map((r) => [r.listing_id, r.id]));
}

export const photoUrl = (photoId: string, size: PhotoSize) => `/photos/${photoId}/${size}`;
/** Browsing renditions only (480 and 960). The 1600 version is loaded when a photo is opened full screen. */
export const photoSrcSet = (photoId: string) => SIZES.filter((s) => s < 1600).map((s) => `${photoUrl(photoId, s)} ${s}w`).join(", ");
