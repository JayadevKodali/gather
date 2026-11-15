/**
 * Venue photos. Generated from docs/gather-venue-images.csv (32 seeded listings and the payment-testing room).
 * The photos are illustrative renders of fictional venues: never infer a listing fact
 * (capacity, facilities, layout) from a photo — those always come from the listing data.
 *
 * A listing whose slug isn't here (e.g. one an owner creates) gets the drawn fallback.
 */
export interface VenuePhoto {
  src: string;
  alt: string;
}

export const VENUE_PHOTOS: Record<string, VenuePhoto> = {
  "v01-loom-room": { src: "/images/venues/v01-loom-room.webp", alt: "Illustrative view of The Loom Room, a fictional Gather venue in Shoreditch." },
  "v02-copper-arch": { src: "/images/venues/v02-copper-arch.webp", alt: "Illustrative view of Copper Arch Studio, a fictional Gather venue in Hackney Wick." },
  "v03-glass-yard": { src: "/images/venues/v03-glass-yard.webp", alt: "Illustrative view of The Glass Yard, a fictional Gather venue in Bethnal Green." },
  "v04-alder-dining": { src: "/images/venues/v04-alder-dining.webp", alt: "Illustrative view of Alder Private Dining, a fictional Gather venue in Shoreditch." },
  "v05-fennel-finch": { src: "/images/venues/v05-fennel-finch.webp", alt: "Illustrative view of Fennel & Finch Upper Room, a fictional Gather venue in Clerkenwell." },
  "v06-saltbox-gallery": { src: "/images/venues/v06-saltbox-gallery.webp", alt: "Illustrative view of Saltbox Gallery, a fictional Gather venue in Hoxton." },
  "v07-kiln-rooms": { src: "/images/venues/v07-kiln-rooms.webp", alt: "Illustrative view of The Kiln Rooms, a fictional Gather venue in Dalston." },
  "v08-brickwork-social": { src: "/images/venues/v08-brickwork-social.webp", alt: "Illustrative view of Brickwork Social, a fictional Gather venue in Spitalfields." },
  "v09-thimble-thread": { src: "/images/venues/v09-thimble-thread.webp", alt: "Illustrative view of Thimble & Thread, a fictional Gather venue in Bermondsey." },
  "v10-signal-box": { src: "/images/venues/v10-signal-box.webp", alt: "Illustrative view of Riverside Signal Box, a fictional Gather venue in Wapping." },
  "v11-orchard-rooftop": { src: "/images/venues/v11-orchard-rooftop.webp", alt: "Illustrative view of Orchard House Rooftop, a fictional Gather venue in London Bridge." },
  "v12-tin-chapel": { src: "/images/venues/v12-tin-chapel.webp", alt: "Illustrative view of The Tin Chapel, a fictional Gather venue in Peckham." },
  "v13-marlowe-club": { src: "/images/venues/v13-marlowe-club.webp", alt: "Illustrative view of Marlowe Members' Club, a fictional Gather venue in Soho." },
  "v14-cinder-screening": { src: "/images/venues/v14-cinder-screening.webp", alt: "Illustrative view of Cinder Screening Room, a fictional Gather venue in King's Cross." },
  "v15-lamplight-library": { src: "/images/venues/v15-lamplight-library.webp", alt: "Illustrative view of The Lamplight Library, a fictional Gather venue in Bloomsbury." },
  "v16-mv-wren": { src: "/images/venues/v16-mv-wren.webp", alt: "Illustrative view of MV Wren, a fictional Gather venue in Greenwich." },
  "v17-foundry-hall": { src: "/images/venues/v17-foundry-hall.webp", alt: "Illustrative view of Foundry Hall, a fictional Gather venue in Bow." },
  "v18-pinehurst-suite": { src: "/images/venues/v18-pinehurst-suite.webp", alt: "Illustrative view of Pinehurst Conference Suite, a fictional Gather venue in Liverpool Street." },
  "v19-wren-lane-loft": { src: "/images/venues/v19-wren-lane-loft.webp", alt: "Illustrative view of Wren Lane Loft, a fictional Gather venue in Clerkenwell." },
  "v20-little-ember": { src: "/images/venues/v20-little-ember.webp", alt: "Illustrative view of Little Ember Supper Club, a fictional Gather venue in Hackney Central." },
  "v21-hollow-oak": { src: "/images/venues/v21-hollow-oak.webp", alt: "Illustrative view of Hollow Oak Function Room, a fictional Gather venue in Kentish Town." },
  "v22-northlight-studio": { src: "/images/venues/v22-northlight-studio.webp", alt: "Illustrative view of Northlight Studio, a fictional Gather venue in Hackney Wick." },
  "v23-southbank-terrace": { src: "/images/venues/v23-southbank-terrace.webp", alt: "Illustrative view of Southbank Terrace Room, a fictional Gather venue in Waterloo." },
  "v24-brixton-vaults": { src: "/images/venues/v24-brixton-vaults.webp", alt: "Illustrative view of Brixton Vaults, a fictional Gather venue in Brixton." },
  "v25-deptford-printworks": { src: "/images/venues/v25-deptford-printworks.webp", alt: "Illustrative view of Deptford Printworks, a fictional Gather venue in Deptford." },
  "v26-battersea-glasshouse": { src: "/images/venues/v26-battersea-glasshouse.webp", alt: "Illustrative view of Battersea Glasshouse, a fictional Gather venue in Battersea." },
  "v27-drawing-room": { src: "/images/venues/v27-drawing-room.webp", alt: "Illustrative view of The Notting Hill Drawing Room, a fictional Gather venue in Notting Hill." },
  "v28-stratford-atrium": { src: "/images/venues/v28-stratford-atrium.webp", alt: "Illustrative view of Stratford Atrium, a fictional Gather venue in Stratford." },
  "v29-assembly-rooms": { src: "/images/venues/v29-assembly-rooms.webp", alt: "Illustrative view of Walthamstow Assembly Hall, a fictional Gather venue in Walthamstow." },
  "v30-angel-canal-room": { src: "/images/venues/v30-angel-canal-room.webp", alt: "Illustrative view of Angel Canal Room, a fictional Gather venue in Angel." },
  "v31-cellar-aldgate": { src: "/images/venues/v31-cellar-aldgate.webp", alt: "Illustrative view of The Aldgate Cellar, a fictional Gather venue in Aldgate." },
  "v32-fitzrovia-glass-box": { src: "/images/venues/v32-fitzrovia-glass-box.webp", alt: "Illustrative view of Fitzrovia Glass Box, a fictional Gather venue in Fitzrovia." },
  "v90-gather-test-room": { src: "/images/venues/v90-gather-test-room.jpg", alt: "Illustrative view of Gather Test Room, the fictional payment-testing room in Finsbury Park, with rows of chairs facing a wall screen." },
};

export function venuePhoto(slug: string): VenuePhoto | null {
  return VENUE_PHOTOS[slug] ?? null;
}

export const HERO_IMAGES = {
  loomDusk: { src: "/images/hero/loom-room-dusk.webp", alt: "The Loom Room at dusk: a warehouse event space with long tables, warm pendant lights and tall steel windows. Illustrative image of a fictional venue." },
  loomCutaway: { src: "/images/hero/loom-room-3d-cutaway.webp", alt: "Illustrative architectural cutaway of a warehouse event space with round tables, a lounge area, a bar and a mezzanine." },
  glasshouseCutaway: { src: "/images/hero/battersea-glasshouse-3d-cutaway.webp", alt: "Illustrative architectural cutaway of a Victorian glasshouse venue set for a long-table dinner, with olive trees and stone steps." },
  glasshouseDaylight: { src: "/images/hero/battersea-glasshouse-daylight.webp", alt: "Battersea Glasshouse in daylight. Illustrative image of a fictional venue." },
} as const;

/** The homepage "Every room is checked" image: one swappable file, shown in a fixed 3:2 frame (focus on the right). */
export const CHECKED_IMAGE = HERO_IMAGES.loomCutaway;
