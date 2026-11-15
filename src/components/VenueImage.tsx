/**
 * The one way Gather shows a venue picture.
 * An owner's uploaded cover comes first; otherwise a seeded listing uses its photo; anything else gets
 * the drawn fallback, clearly an illustration. The wrapper sets the shape; the image fills it.
 */
import Image from "next/image";
import { photoSrcSet, photoUrl } from "@/lib/services/photos";
import { venuePhoto } from "@/lib/venue-images";
import { VenueArt } from "./VenueArt";

export function VenueImage({
  slug,
  name,
  type,
  sizes,
  preload = false,
  className = "",
  coverId = null,
}: {
  slug: string;
  name: string;
  type: string;
  sizes: string;
  preload?: boolean;
  className?: string;
  /** The owner's uploaded cover photo, if any. It replaces a seeded venue's original photo. */
  coverId?: string | null;
}) {
  const photo = venuePhoto(slug);
  return (
    <div className={`venue-image ${className}`} data-photo={photo || coverId ? "yes" : "fallback"}>
      {coverId ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by /photos at fixed 3:2 sizes
        <img src={photoUrl(coverId, 960)} srcSet={photoSrcSet(coverId)} sizes={sizes} alt={`Photo of ${name}, uploaded by the venue.`} loading={preload ? "eager" : "lazy"} className="venue-upload" />
      ) : photo ? (
        <Image src={photo.src} alt={photo.alt} fill sizes={sizes} preload={preload} />
      ) : (
        <>
          <VenueArt id={slug} type={type} label={`Drawn illustration for ${name}. No photo uploaded yet.`} />
          <span className="image-note">Photo coming soon</span>
        </>
      )}
    </div>
  );
}
