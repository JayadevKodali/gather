"use client";
/**
 * Venue page photos: the cover large, the other photos as thumbnails, and a full-screen viewer.
 *
 * Browsing uses lightweight thumbnails (next/image for committed files, the 480/960 renditions for uploads).
 * Opening a photo loads its full-screen source only then: the committed file as-is, or the largest stored
 * upload. Full screen fits the whole photo in the viewport on a dark background, keeps its aspect ratio and
 * never scales it past its native size.
 *
 * Viewer: a native <dialog> (focus stays inside, Escape closes), previous/next buttons, "2 of 3", a visible
 * Close button, arrow keys, swipe on touch screens, and focus goes back to the photo that opened it.
 */
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryItem, GalleryThumb } from "@/lib/gallery";

function Thumb({ thumb, alt, sizes, preload = false }: { thumb: GalleryThumb; alt: string; sizes: string; preload?: boolean }) {
  if (thumb.kind === "static") return <Image src={thumb.src} alt={alt} fill sizes={sizes} preload={preload} />;
  // eslint-disable-next-line @next/next/no-img-element -- stored renditions served by /photos
  return <img src={thumb.src} srcSet={thumb.srcSet} sizes={sizes} alt={alt} loading={preload ? "eager" : "lazy"} className="venue-upload" />;
}

export function VenueGallery({ items, name }: { items: GalleryItem[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const openers = useRef<(HTMLButtonElement | null)[]>([]);
  const touchX = useRef<number | null>(null);
  const openedFrom = useRef<number>(0); // the photo whose button opened the viewer

  const count = items.length;

  const show = (i: number) => {
    openedFrom.current = i;
    setOpen(i);
    dialog.current?.showModal();
  };
  const close = useCallback(() => dialog.current?.close(), []);
  const step = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + count) % count)), [count]);

  // Return focus to the photo that opened the viewer, whichever way it closed (button, Escape, backdrop).
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onClose = () => {
      setOpen(null);
      // Back to the photo that opened the viewer, even if the viewer was moved on to another photo.
      requestAnimationFrame(() => openers.current[openedFrom.current]?.focus());
    };
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, []);

  // Warm the neighbours so next/previous feel instant (full-size files, only once the viewer is open).
  useEffect(() => {
    if (open === null || count < 2) return;
    for (const d of [1, -1]) {
      const img = new window.Image();
      img.src = items[(open + d + count) % count].full;
    }
  }, [open, count, items]);

  if (count === 0) return null;
  const current = open === null ? null : items[open];

  return (
    <div className="venue-gallery">
      <div className="venue-hero">
        <button type="button" className="gallery-open hero-open" ref={(el) => { openers.current[0] = el; }} onClick={() => show(0)}
          aria-label={`Open photo 1 of ${count} full screen: ${items[0].alt}`}>
          <span className="venue-image" data-photo="yes">
            <Thumb thumb={items[0].thumb} alt={items[0].alt} sizes="(max-width: 1200px) 100vw, 1160px" preload />
          </span>
          <span className="gallery-hint" aria-hidden="true">{count > 1 ? `View all ${count} photos` : "View full screen"}</span>
        </button>
      </div>
      {count > 1 && (
        <ul className="gallery" aria-label={`More photos of ${name}`}>
          {items.slice(1).map((item, j) => {
            const i = j + 1;
            return (
              <li key={item.key}>
                <button type="button" className="gallery-open" ref={(el) => { openers.current[i] = el; }} onClick={() => show(i)}
                  aria-label={`Open photo ${i + 1} of ${count} full screen: ${item.alt}`}>
                  <span className="gallery-thumb"><Thumb thumb={item.thumb} alt={item.alt} sizes="(max-width: 700px) 50vw, 280px" /></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <dialog
        ref={dialog}
        className="viewer"
        aria-label={`${name} photos`}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
          else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
        }}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 45 && count > 1) step(dx < 0 ? 1 : -1);
        }}
      >
        {current && (
          <>
            <div className="viewer-bar">
              <span className="viewer-count" aria-live="polite">{open! + 1} of {count}</span>
              <button type="button" className="viewer-close" onClick={close} autoFocus>Close <span aria-hidden="true">×</span></button>
            </div>
            <figure className="viewer-stage">
              {/* eslint-disable-next-line @next/next/no-img-element -- the original file, shown at up to its native size */}
              <img key={current.key} src={current.full} alt={current.alt} width={current.width} height={current.height}
                style={{ maxWidth: `min(100%, ${current.width}px)`, maxHeight: `min(100%, ${current.height}px)` }} />
              <figcaption className="sr-only">{current.alt}</figcaption>
            </figure>
            {count > 1 && (
              <>
                <button type="button" className="viewer-nav prev" onClick={() => step(-1)} aria-label="Previous photo"><span aria-hidden="true">‹</span></button>
                <button type="button" className="viewer-nav next" onClick={() => step(1)} aria-label="Next photo"><span aria-hidden="true">›</span></button>
              </>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
