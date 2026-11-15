# Gather visual assets

This branch adds the image files for a frontend refresh. The four hero options and 32 venue photos are web-ready WebPs generated for fictional Gather venues.

## Hero options

| File in `public/images/hero/` | Placement |
| --- | --- |
| `loom-room-dusk.webp` | Recommended homepage hero. Keep the venue visible to the right, with live headline and booking CTA in the dark left portion. |
| `battersea-glasshouse-daylight.webp` | Alternate photographic hero with a brighter editorial mood. |
| `loom-room-3d-cutaway.webp` | Dark-background architectural render suitable for a split hero or a scroll reveal. |
| `battersea-glasshouse-3d-cutaway.webp` | Light-background architectural render suitable for a split hero or a scroll reveal. |

Both cutaways are still images.

## Venue images

[The venue image map](gather-venue-images.csv) matches all 32 seed slugs in `data/venues.json` to an image filename and suggested alt text. Render a seeded venue at `/images/venues/<slug>.webp`. Reuse the photo across the homepage, results and venue details. Keep a fallback for user-created listings whose slug is absent from the image map. Do not infer any listing fact from the image.

## Integration

Start with the photographic hero and consistent venue cards. Keep the copy live and legible on top of photography, or stack it above the image for narrow screens. Use the first booking CTA as the focus of the hero. Reserve optional motion for subtle image or scroll reveals, with a static fallback for reduced motion. Retest discovery, enquiries and the booking journey after the frontend change.
