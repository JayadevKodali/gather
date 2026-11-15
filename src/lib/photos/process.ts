/**
 * Checks and prepares an uploaded venue photo. Everything is decided from the decoded image,
 * never from the file name or the browser's MIME type.
 *
 *  - JPEG, PNG or WebP only (decoded format), at most 4 MB, between 1200 × 800 and 10,000 px a side
 *  - orientation normalised from EXIF, then all metadata (EXIF, GPS, ICC comments) dropped
 *  - one consistent 3:2 crop (attention-based, so the busiest part of the picture stays in),
 *    saved as WebP at three widths for responsive loading
 */
import sharp, { type Metadata } from "sharp";

export const MAX_PHOTOS = 6;
export const MAX_BYTES = 4 * 1024 * 1024;
export const MIN_WIDTH = 1200;
export const MIN_HEIGHT = 800;
export const MAX_SIDE = 10_000;
export const SIZES = [480, 960, 1600] as const;
export type PhotoSize = (typeof SIZES)[number];
export const ACCEPT = "image/jpeg,image/png,image/webp";

export class PhotoError extends Error {}

export interface ProcessedPhoto {
  width: number;
  height: number;
  bytes: number;
  variants: { size: PhotoSize; data: Buffer }[];
}

export async function processPhoto(input: Buffer, fileName = "photo"): Promise<ProcessedPhoto> {
  const label = `“${fileName.slice(0, 60)}”`;
  if (input.length === 0) throw new PhotoError(`${label} is empty.`);
  if (input.length > MAX_BYTES) throw new PhotoError(`${label} is ${(input.length / 1024 / 1024).toFixed(1)} MB. Photos must be 4 MB or smaller.`);
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_SIDE * MAX_SIDE, failOn: "error" }).metadata();
  } catch {
    throw new PhotoError(`${label} isn't a readable JPEG, PNG or WebP image.`);
  }
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) throw new PhotoError(`${label} is a ${meta.format ?? "unknown"} file. Use JPEG, PNG or WebP.`);
  if ((meta.pages ?? 1) > 1) throw new PhotoError(`${label} is animated. Use a still photo.`);
  // Width/height as displayed, after EXIF rotation.
  const rotated = (meta.orientation ?? 1) >= 5;
  const w = rotated ? meta.height! : meta.width!;
  const h = rotated ? meta.width! : meta.height!;
  if (!w || !h) throw new PhotoError(`${label} has no size information.`);
  if (w > MAX_SIDE || h > MAX_SIDE) throw new PhotoError(`${label} is ${w} × ${h} pixels. The longest side can be at most ${MAX_SIDE.toLocaleString("en-GB")}.`);
  if (w < MIN_WIDTH || h < MIN_HEIGHT) throw new PhotoError(`${label} is ${w} × ${h} pixels. Photos need to be at least ${MIN_WIDTH} × ${MIN_HEIGHT}.`);

  const variants = await Promise.all(
    SIZES.map(async (size) => ({
      size,
      data: await sharp(input, { limitInputPixels: MAX_SIDE * MAX_SIDE })
        .rotate() // apply EXIF orientation; output carries no metadata
        .resize(size, Math.round((size * 2) / 3), { fit: "cover", position: sharp.strategy.attention })
        .webp({ quality: 80 })
        .toBuffer(),
    })),
  );
  return { width: SIZES[SIZES.length - 1], height: Math.round((SIZES[SIZES.length - 1] * 2) / 3), bytes: variants.reduce((n, v) => n + v.data.length, 0), variants };
}
