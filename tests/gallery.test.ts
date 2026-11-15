import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { venueGallery } from "@/lib/gallery";
import { COVER_SIZES, VENUE_ALTERNATES } from "@/lib/venue-gallery";

const csv = fs.readFileSync(path.join(process.cwd(), "docs/gather-venue-gallery.csv"), "utf8").trim().split("\n").slice(1);

describe("venue galleries", () => {
  it("maps every CSV row, in gallery order, to a committed 1440 × 960 file", () => {
    expect(csv).toHaveLength(33);
    const total = Object.values(VENUE_ALTERNATES).flat();
    expect(total).toHaveLength(33);
    expect(total.map((i) => i.src).sort()).toEqual(csv.map((row) => row.split(",")[2]).sort());
    for (const img of total) {
      expect(fs.existsSync(path.join(process.cwd(), "public", img.src))).toBe(true);
      expect([img.width, img.height]).toEqual([1440, 960]);
      expect(img.alt).toMatch(/^Illustrative/);
    }
    expect(VENUE_ALTERNATES["v01-loom-room"].map((i) => i.src)).toEqual(["/images/venues/v01-loom-room-02.webp", "/images/venues/v01-loom-room-03.webp"]);
  });

  it("keeps the cover first: the Loom Room shows 3 photos, every other seeded venue 2 (cover, then its -02 view)", () => {
    expect(venueGallery("v01-loom-room", "The Loom Room", []).map((i) => i.full)).toEqual([
      "/images/venues/v01-loom-room.webp", "/images/venues/v01-loom-room-02.webp", "/images/venues/v01-loom-room-03.webp",
    ]);
    const others = Object.keys(COVER_SIZES).filter((s) => s !== "v01-loom-room" && s !== "v90-gather-test-room");
    expect(others).toHaveLength(31);
    for (const slug of others) {
      const g = venueGallery(slug, slug, []);
      expect(g.map((i) => i.full), slug).toEqual([`/images/venues/${slug}.webp`, `/images/venues/${slug}-02.webp`]);
    }
  });

  it("full screen uses the committed file at its native size; browsing uses thumbnails", () => {
    const [cover, alt] = venueGallery("v02-copper-arch", "Copper Arch Studio", []);
    expect(cover).toMatchObject({ full: "/images/venues/v02-copper-arch.webp", width: 1440, height: 960, thumb: { kind: "static" } });
    expect(alt).toMatchObject({ full: "/images/venues/v02-copper-arch-02.webp", width: 1440, height: 960 });
  });

  it("every cover has a committed file and is recorded at 1440 × 960", () => {
    for (const [slug, size] of Object.entries(COVER_SIZES)) {
      const file = fs.readdirSync(path.join(process.cwd(), "public/images/venues")).find((f) => f.startsWith(`${slug}.`));
      expect(file, slug).toBeTruthy();
      expect(size, slug).toEqual([1440, 960]);
    }
  });

  it("the payment-testing room is a single-photo venue; a venue with no photo has none", () => {
    const g = venueGallery("v90-gather-test-room", "Gather Test Room", []);
    expect(g.map((i) => [i.full, i.width, i.height])).toEqual([["/images/venues/v90-gather-test-room.jpg", 1440, 960]]);
    expect(venueGallery("not-seeded", "New Loft", [])).toEqual([]);
  });

  it("owner uploads replace the seeded photos, in the owner's order, opening the largest stored version", () => {
    const g = venueGallery("v01-loom-room", "The Loom Room", [{ id: "p2" }, { id: "p1" }]);
    expect(g.map((i) => i.full)).toEqual(["/photos/p2/1600", "/photos/p1/1600"]);
    expect(g[0].thumb).toMatchObject({ kind: "upload", src: "/photos/p2/960" });
    expect(g[0]).toMatchObject({ width: 1600, height: 1067 });
  });
});
