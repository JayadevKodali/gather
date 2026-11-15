/**
 * Venue photo galleries for the seeded (fictional) venues: the cover from venue-images.ts, then the
 * alternate views in docs/gather-venue-gallery.csv, in gallery_position order. Width and height are the
 * committed files' native pixel sizes, used to show each photo full screen without upscaling it.
 * Generated from those two sources; regenerate if either changes.
 */
export interface GalleryImage { src: string; alt: string; width: number; height: number }

/** Native size of every seeded cover photo. */
export const COVER_SIZES: Record<string, [number, number]> = {
  "v01-loom-room": [1440, 960],
  "v02-copper-arch": [1440, 960],
  "v03-glass-yard": [1440, 960],
  "v04-alder-dining": [1440, 960],
  "v05-fennel-finch": [1440, 960],
  "v06-saltbox-gallery": [1440, 960],
  "v07-kiln-rooms": [1440, 960],
  "v08-brickwork-social": [1440, 960],
  "v09-thimble-thread": [1440, 960],
  "v10-signal-box": [1440, 960],
  "v11-orchard-rooftop": [1440, 960],
  "v12-tin-chapel": [1440, 960],
  "v13-marlowe-club": [1440, 960],
  "v14-cinder-screening": [1440, 960],
  "v15-lamplight-library": [1440, 960],
  "v16-mv-wren": [1440, 960],
  "v17-foundry-hall": [1440, 960],
  "v18-pinehurst-suite": [1440, 960],
  "v19-wren-lane-loft": [1440, 960],
  "v20-little-ember": [1440, 960],
  "v21-hollow-oak": [1440, 960],
  "v22-northlight-studio": [1440, 960],
  "v23-southbank-terrace": [1440, 960],
  "v24-brixton-vaults": [1440, 960],
  "v25-deptford-printworks": [1440, 960],
  "v26-battersea-glasshouse": [1440, 960],
  "v27-drawing-room": [1440, 960],
  "v28-stratford-atrium": [1440, 960],
  "v29-assembly-rooms": [1440, 960],
  "v30-angel-canal-room": [1440, 960],
  "v31-cellar-aldgate": [1440, 960],
  "v32-fitzrovia-glass-box": [1440, 960],
  "v90-gather-test-room": [1440, 960],
};

/** Alternate views after the cover, in order. */
export const VENUE_ALTERNATES: Record<string, GalleryImage[]> = {
  "v01-loom-room": [
    { src: "/images/venues/v01-loom-room-02.webp", alt: "Illustrative view across The Loom Room with tall factory windows and standing reception tables.", width: 1440, height: 960 },
    { src: "/images/venues/v01-loom-room-03.webp", alt: "Illustrative side view of the dining layout at The Loom Room, with round tables beneath timber trusses.", width: 1440, height: 960 },
  ],
  "v02-copper-arch": [
    { src: "/images/venues/v02-copper-arch-02.webp", alt: "Illustrative view from behind the curved copper bar at Copper Arch Studio, across the open floor to the roller door and the canal.", width: 1440, height: 960 },
  ],
  "v03-glass-yard": [
    { src: "/images/venues/v03-glass-yard-02.webp", alt: "Illustrative close view of a candlelit bistro table under festoon lights at The Glass Yard, with the brick bar behind.", width: 1440, height: 960 },
  ],
  "v04-alder-dining": [
    { src: "/images/venues/v04-alder-dining-02.webp", alt: "Illustrative view down the long candlelit dining table at Alder Private Dining, with wood panelling and shelves.", width: 1440, height: 960 },
  ],
  "v05-fennel-finch": [
    { src: "/images/venues/v05-fennel-finch-02.webp", alt: "Illustrative view across Fennel & Finch Upper Room to its arched bar, with the long dining table under a glass chandelier.", width: 1440, height: 960 },
  ],
  "v06-saltbox-gallery": [
    { src: "/images/venues/v06-saltbox-gallery-02.webp", alt: "Illustrative wide view of Saltbox Gallery's white exhibition floor, with sculptures, columns and track lighting.", width: 1440, height: 960 },
  ],
  "v07-kiln-rooms": [
    { src: "/images/venues/v07-kiln-rooms-02.webp", alt: "Illustrative view from the stage down the brick-vaulted hall of The Kiln Rooms, with speakers and stage lights.", width: 1440, height: 960 },
  ],
  "v08-brickwork-social": [
    { src: "/images/venues/v08-brickwork-social-02.webp", alt: "Illustrative view of the function room at Brickwork Social, with oxblood leather booths and candlelit tables.", width: 1440, height: 960 },
  ],
  "v09-thimble-thread": [
    { src: "/images/venues/v09-thimble-thread-02.webp", alt: "Illustrative view along the long timber table at Thimble & Thread, past vintage sewing machines and a dress form.", width: 1440, height: 960 },
  ],
  "v10-signal-box": [
    { src: "/images/venues/v10-signal-box-02.webp", alt: "Illustrative view from the riverside balcony back into Riverside Signal Box through its open steel-framed doors.", width: 1440, height: 960 },
  ],
  "v11-orchard-rooftop": [
    { src: "/images/venues/v11-orchard-rooftop-02.webp", alt: "Illustrative view of timber tables and lounge seating on Orchard House Rooftop at sunset, with the skyline and a big wheel.", width: 1440, height: 960 },
  ],
  "v12-tin-chapel": [
    { src: "/images/venues/v12-tin-chapel-02.webp", alt: "Illustrative view across the open wooden floor of The Tin Chapel, with corrugated walls and pointed arched windows.", width: 1440, height: 960 },
  ],
  "v13-marlowe-club": [
    { src: "/images/venues/v13-marlowe-club-02.webp", alt: "Illustrative view along the bar at Marlowe Members' Club towards the fireplace and green leather armchairs.", width: 1440, height: 960 },
  ],
  "v14-cinder-screening": [
    { src: "/images/venues/v14-cinder-screening-02.webp", alt: "Illustrative view from the side steps of Cinder Screening Room's raked red velvet seats.", width: 1440, height: 960 },
  ],
  "v15-lamplight-library": [
    { src: "/images/venues/v15-lamplight-library-02.webp", alt: "Illustrative view of the reading tables with green lamps in The Lamplight Library, beneath its galleried bookshelves.", width: 1440, height: 960 },
  ],
  "v16-mv-wren": [
    { src: "/images/venues/v16-mv-wren-02.webp", alt: "Illustrative view inside the saloon of MV Wren, with window seating, small tables and the river outside.", width: 1440, height: 960 },
  ],
  "v17-foundry-hall": [
    { src: "/images/venues/v17-foundry-hall-02.webp", alt: "Illustrative view across Foundry Hall's industrial floor to round dining tables beneath the steel and glass roof.", width: 1440, height: 960 },
  ],
  "v18-pinehurst-suite": [
    { src: "/images/venues/v18-pinehurst-suite-02.webp", alt: "Illustrative view of Pinehurst Conference Suite set as a boardroom, one long table facing the City towers.", width: 1440, height: 960 },
  ],
  "v19-wren-lane-loft": [
    { src: "/images/venues/v19-wren-lane-loft-02.webp", alt: "Illustrative view of Wren Lane Loft's dining table, sofa and bookshelves under two roof windows.", width: 1440, height: 960 },
  ],
  "v20-little-ember": [
    { src: "/images/venues/v20-little-ember-02.webp", alt: "Illustrative view along the counter seats at Little Ember Supper Club, facing the open kitchen and its wood fire.", width: 1440, height: 960 },
  ],
  "v21-hollow-oak": [
    { src: "/images/venues/v21-hollow-oak-02.webp", alt: "Illustrative view across Hollow Oak Function Room from the wooden bar to red banquettes and tall sash windows.", width: 1440, height: 960 },
  ],
  "v22-northlight-studio": [
    { src: "/images/venues/v22-northlight-studio-02.webp", alt: "Illustrative view of Northlight Studio's white infinity cove beneath tall industrial windows.", width: 1440, height: 960 },
  ],
  "v23-southbank-terrace": [
    { src: "/images/venues/v23-southbank-terrace-02.webp", alt: "Illustrative view from the river terrace into Southbank Terrace Room through its open glass doors.", width: 1440, height: 960 },
  ],
  "v24-brixton-vaults": [
    { src: "/images/venues/v24-brixton-vaults-02.webp", alt: "Illustrative view under the brick arches of Brixton Vaults, with purple and amber lighting on the dance floor.", width: 1440, height: 960 },
  ],
  "v25-deptford-printworks": [
    { src: "/images/venues/v25-deptford-printworks-02.webp", alt: "Illustrative view down Deptford Printworks' empty print hall, beneath a yellow gantry crane.", width: 1440, height: 960 },
  ],
  "v26-battersea-glasshouse": [
    { src: "/images/venues/v26-battersea-glasshouse-02.webp", alt: "Illustrative view from the stone steps into Battersea Glasshouse, with long dining tables through the open doors.", width: 1440, height: 960 },
  ],
  "v27-drawing-room": [
    { src: "/images/venues/v27-drawing-room-02.webp", alt: "Illustrative view of The Notting Hill Drawing Room's fireplace, grand piano and tall sash windows.", width: 1440, height: 960 },
  ],
  "v28-stratford-atrium": [
    { src: "/images/venues/v28-stratford-atrium-02.webp", alt: "Illustrative view from an upper gallery down onto Stratford Atrium's floor set for a reception.", width: 1440, height: 960 },
  ],
  "v29-assembly-rooms": [
    { src: "/images/venues/v29-assembly-rooms-02.webp", alt: "Illustrative view across Walthamstow Assembly Hall's wooden floor towards its stage, under globe lights.", width: 1440, height: 960 },
  ],
  "v30-angel-canal-room": [
    { src: "/images/venues/v30-angel-canal-room-02.webp", alt: "Illustrative view of the dining table in Angel Canal Room, beside open doors to the canal.", width: 1440, height: 960 },
  ],
  "v31-cellar-aldgate": [
    { src: "/images/venues/v31-cellar-aldgate-02.webp", alt: "Illustrative view of candlelit tables among the barrels and wine racks of The Aldgate Cellar's brick vaults.", width: 1440, height: 960 },
  ],
  "v32-fitzrovia-glass-box": [
    { src: "/images/venues/v32-fitzrovia-glass-box-02.webp", alt: "Illustrative view of a round table and lounge seating in Fitzrovia Glass Box, beside full-height street windows.", width: 1440, height: 960 },
  ],
};
