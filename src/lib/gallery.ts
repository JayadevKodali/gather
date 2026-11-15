/**
 * The photos a venue page shows, in order, with two sources each:
 *  - a lightweight thumbnail for browsing the page, and
 *  - the sharpest file we have, loaded only when the photo is opened full screen.
 *
 * Owner uploads win: if the owner has uploaded photos, those (and their chosen cover) are the gallery.
 * Otherwise a seeded venue shows its cover, then its alternate views. A venue with neither has no gallery.
 */
import { SIZES } from "@/lib/photos/process";
import { photoSrcSet } from "@/lib/services/photos";
import { COVER_SIZES, VENUE_ALTERNATES } from "@/lib/venue-gallery";
import { venuePhoto } from "@/lib/venue-images";

export type GalleryThumb =
  | { kind: "static"; src: string } // optimised by next/image at the size the page needs
  | { kind: "upload"; src: string; srcSet: string }; // the stored 480/960/1600 renditions

export interface GalleryItem {
  key: string;
  alt: string;
  thumb: GalleryThumb;
  /** Full-screen source: the committed file itself, or the largest stored upload. Never re-compressed. */
  full: string;
  width: number;
  height: number;
}

const LARGEST = SIZES[SIZES.length - 1];

export function venueGallery(slug: string, name: string, uploads: { id: string }[]): GalleryItem[] {
  if (uploads.length > 0) {
    return uploads.map((p, i) => ({
      key: p.id,
      alt: `${name}, photo ${i + 1} of ${uploads.length}, uploaded by the venue.`,
      // Browsing never pulls the 1600 rendition, even for the big cover; that's kept for full screen.
      thumb: { kind: "upload", src: `/photos/${p.id}/960`, srcSet: photoSrcSet(p.id) },
      full: `/photos/${p.id}/${LARGEST}`,
      width: LARGEST,
      height: Math.round((LARGEST * 2) / 3),
    }));
  }
  const cover = venuePhoto(slug);
  if (!cover) return [];
  const [w, h] = COVER_SIZES[slug] ?? [881, 437];
  return [
    { key: cover.src, alt: cover.alt, thumb: { kind: "static", src: cover.src }, full: cover.src, width: w, height: h },
    ...(VENUE_ALTERNATES[slug] ?? []).map((a) => ({ key: a.src, alt: a.alt, thumb: { kind: "static" as const, src: a.src }, full: a.src, width: a.width, height: a.height })),
  ];
}
