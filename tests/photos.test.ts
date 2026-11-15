import sharp, { type Sharp } from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { setPhotoStoreForTests, type PhotoStore } from "@/lib/adapters/photo-storage";
import { createPgliteDb, migrate, type Db } from "@/lib/db";
import { processPhoto } from "@/lib/photos/process";
import { seedAccountsAndVenues } from "@/lib/seed";
import type { Actor } from "@/lib/services/errors";
import { createListing, setPublished, updateListing } from "@/lib/services/listings";
import { addPhotos, coverPhotoIds, listPhotos, movePhoto, photoForViewing, removePhoto, reorderPhotos, setCover } from "@/lib/services/photos";

let db: Db;
let actors: Map<string, Actor>;
const A = (email: string) => actors.get(email)!;
const files = new Map<string, Buffer>();
const memoryStore: PhotoStore = {
  async put(k, b) { files.set(k, b); },
  async get(k) { return files.get(k) ?? null; },
  async remove(keys) { keys.forEach((k) => files.delete(k)); },
};

const jpeg = (w = 1600, h = 1200, extra: (s: Sharp) => Sharp = (s) => s) =>
  extra(sharp({ create: { width: w, height: h, channels: 3, background: { r: 40, g: 90, b: 70 } } })).jpeg().toBuffer();

const listingInput = { name: "Photo Test Room", venueType: "Room", borough: "Hackney", pricingModel: "hire_fee", pricePence: 50_000, capacityStanding: 40, capacitySeated: null, capacityMixed: null };

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  actors = await seedAccountsAndVenues(db, "test-password-123");
  setPhotoStoreForTests(memoryStore);
});

describe("photo checks use the decoded image", () => {
  it("normalises orientation, crops to 3:2 at three sizes and strips metadata", async () => {
    // 1200 × 1800 portrait stored sideways with EXIF orientation 6 and GPS-like comment metadata.
    const input = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: "#336655" } })
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "secret owner", ImageDescription: "51.5N 0.1W" } } }).jpeg().toBuffer();
    const p = await processPhoto(input, "phone.jpg");
    expect(p.variants.map((v) => v.size)).toEqual([480, 960, 1600]);
    for (const v of p.variants) {
      const m = await sharp(v.data).metadata();
      expect(m.format).toBe("webp");
      expect(m.width! / m.height!).toBeCloseTo(1.5, 1);
      expect(m.exif).toBeUndefined();
      expect(m.orientation ?? 1).toBe(1);
    }
  });

  it("rejects non-images named like images, unsupported formats, small and oversized files", async () => {
    await expect(processPhoto(Buffer.from("not an image at all"), "fake.jpg")).rejects.toThrow(/isn't a readable/);
    const gif = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#000" } }).gif().toBuffer();
    await expect(processPhoto(gif, "anim.jpg")).rejects.toThrow(/gif file/);
    await expect(processPhoto(await jpeg(800, 600), "small.jpg")).rejects.toThrow(/at least 1200 × 800/);
    await expect(processPhoto(Buffer.alloc(5 * 1024 * 1024, 1), "huge.jpg")).rejects.toThrow(/4 MB or smaller/);
  });
});

describe("drag to reorder (Phase 4)", () => {
  it("saves a whole new order, and the first photo becomes the cover", async () => {
    const owner = A("owner@gather.test");
    const id = await createListing(db, owner, listingInput);
    const bytes = await jpeg();
    await addPhotos(db, owner, id, [1, 2, 3].map((n) => ({ name: `${n}.jpg`, bytes })));
    const [a, b, c] = (await listPhotos(db, id)).map((p) => p.id);
    await reorderPhotos(db, owner, id, [c, a, b]);
    const after = await listPhotos(db, id);
    expect(after.map((p) => p.id)).toEqual([c, a, b]);
    expect(after.map((p) => p.position)).toEqual([0, 1, 2]);
    expect((await coverPhotoIds(db, [id])).get(id)).toBe(c);
  });

  it("refuses an order that isn't exactly this listing's photos, and changes nothing", async () => {
    const owner = A("owner@gather.test");
    const id = await createListing(db, owner, listingInput);
    const bytes = await jpeg();
    await addPhotos(db, owner, id, [1, 2].map((n) => ({ name: `${n}.jpg`, bytes })));
    const [a, b] = (await listPhotos(db, id)).map((p) => p.id);
    for (const bad of [[a], [a, a], [b, a, a], [a, "00000000-0000-0000-0000-000000000000"]]) {
      await expect(reorderPhotos(db, owner, id, bad)).rejects.toThrow(/photos changed/);
    }
    expect((await listPhotos(db, id)).map((p) => p.id)).toEqual([a, b]);
  });

  it("only the listing's owner can reorder", async () => {
    const owner = A("owner@gather.test");
    const id = await createListing(db, owner, listingInput);
    const bytes = await jpeg();
    await addPhotos(db, owner, id, [1, 2].map((n) => ({ name: `${n}.jpg`, bytes })));
    const ids = (await listPhotos(db, id)).map((p) => p.id).reverse();
    for (const who of ["owner2@gather.test", "planner@gather.test"]) {
      await expect(reorderPhotos(db, A(who), id, ids)).rejects.toThrow(/own listings|owner/);
    }
  });
});

describe("owner-scoped photos and the publish rule", () => {
  it("a new listing can't be created as published; publishing needs a photo", async () => {
    const owner = A("owner@gather.test");
    await expect(createListing(db, owner, { ...listingInput, published: true })).rejects.toThrow(/at least one photo/);
    const id = await createListing(db, owner, listingInput);
    await expect(setPublished(db, owner, id, true)).rejects.toThrow(/at least one photo/);
    await expect(updateListing(db, owner, id, { ...listingInput, published: true })).rejects.toThrow(/at least one photo/);
    await addPhotos(db, owner, id, [{ name: "a.jpg", bytes: await jpeg() }]);
    await setPublished(db, owner, id, true);
    const [{ is_published }] = await db.query<{ is_published: boolean }>("select is_published from listings where id = $1", [id]);
    expect(is_published).toBe(true);
  });

  it("seeded venues can publish with their own photo", async () => {
    const owner = A("owner@gather.test");
    const [loom] = await db.query<{ id: string }>("select id from listings where slug = 'v01-loom-room'");
    await setPublished(db, owner, loom.id, false);
    await setPublished(db, owner, loom.id, true);
  });

  it("only the listing's owner can add, reorder or remove photos", async () => {
    const owner = A("owner@gather.test");
    const id = await createListing(db, owner, listingInput);
    const bytes = await jpeg();
    for (const who of ["owner2@gather.test", "planner@gather.test", "admin@gather.test"]) {
      await expect(addPhotos(db, A(who), id, [{ name: "x.jpg", bytes }])).rejects.toThrow(/own listings|owner/);
    }
    await addPhotos(db, owner, id, [{ name: "x.jpg", bytes }]);
    const [p] = await listPhotos(db, id);
    await expect(removePhoto(db, A("owner2@gather.test"), id, p.id)).rejects.toThrow(/own listings/);
    await expect(setCover(db, A("owner2@gather.test"), id, p.id)).rejects.toThrow(/own listings/);
  });

  it("keeps 1–6 photos, reorders and sets the cover, and blocks removing a live listing's last photo", async () => {
    const owner = A("owner@gather.test");
    const id = await createListing(db, owner, listingInput);
    const bytes = await jpeg();
    await addPhotos(db, owner, id, [1, 2, 3].map((n) => ({ name: `${n}.jpg`, bytes })));
    await expect(addPhotos(db, owner, id, [1, 2, 3, 4].map((n) => ({ name: `${n}.jpg`, bytes })))).rejects.toThrow(/up to 6 photos/);
    let photos = await listPhotos(db, id);
    expect(photos.map((p) => p.position)).toEqual([0, 1, 2]);
    await setCover(db, owner, id, photos[2].id);
    expect((await coverPhotoIds(db, [id])).get(id)).toBe(photos[2].id);
    await movePhoto(db, owner, id, photos[2].id, 1);
    expect((await listPhotos(db, id))[1].id).toBe(photos[2].id);

    // Replace keeps the position and removes the old files.
    const before = files.size;
    const target = (await listPhotos(db, id))[0];
    await addPhotos(db, owner, id, [{ name: "new.jpg", bytes }], target.id);
    photos = await listPhotos(db, id);
    expect(photos).toHaveLength(3);
    expect(photos.some((p) => p.id === target.id)).toBe(false);
    expect(files.size).toBe(before);

    await setPublished(db, owner, id, true);
    await removePhoto(db, owner, id, photos[0].id);
    await removePhoto(db, owner, id, photos[1].id);
    await expect(removePhoto(db, owner, id, photos[2].id)).rejects.toThrow(/only photo of a live listing/);
    await setPublished(db, owner, id, false);
    await removePhoto(db, owner, id, photos[2].id); // a draft may have none
    expect(await listPhotos(db, id)).toHaveLength(0);
  });

  it("draft photos are visible only to the owner and admin; live ones to everyone", async () => {
    const owner = A("owner@gather.test");
    const id = await createListing(db, owner, listingInput);
    await addPhotos(db, owner, id, [{ name: "d.jpg", bytes: await jpeg() }]);
    const [p] = await listPhotos(db, id);
    await expect(photoForViewing(db, null, p.id, 480)).rejects.toThrow();
    await expect(photoForViewing(db, A("planner@gather.test"), p.id, 480)).rejects.toThrow();
    await expect(photoForViewing(db, A("owner2@gather.test"), p.id, 480)).rejects.toThrow();
    expect((await photoForViewing(db, owner, p.id, 480)).isPublic).toBe(false);
    expect((await photoForViewing(db, A("admin@gather.test"), p.id, 960)).data.length).toBeGreaterThan(0);
    await setPublished(db, owner, id, true);
    expect((await photoForViewing(db, null, p.id, 1600)).isPublic).toBe(true);
    await expect(photoForViewing(db, null, p.id, 123)).rejects.toThrow(); // only the stored sizes
  });
});

describe("Supabase Storage adapter", async () => {
  const { supabasePhotoStore } = await import("@/lib/adapters/photo-storage");
  it("talks to a private bucket from the server with the key only in headers", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return new Response(init.method === undefined ? new Uint8Array([1, 2]) : "{}", { status: 200 });
    }) as unknown as typeof fetch;
    const s = supabasePhotoStore("https://abc.supabase.co", "sb_secret_TESTKEY", "venue-photos", fake);
    await s.put("listings/l1/p1/480.webp", Buffer.from([1]), "image/webp");
    expect((await s.get("listings/l1/p1/480.webp"))?.length).toBe(2);
    await s.remove(["listings/l1/p1/480.webp"]);
    expect(calls[0].url).toBe("https://abc.supabase.co/storage/v1/object/venue-photos/listings/l1/p1/480.webp");
    expect(calls.every((c) => !c.url.includes("TESTKEY"))).toBe(true);
    expect((calls[0].init.headers as Record<string, string>).apikey).toBe("sb_secret_TESTKEY");
    expect(calls[2].init.method).toBe("DELETE");
    await expect(s.put("../escape", Buffer.from([1]), "image/webp")).rejects.toThrow(/Bad storage key/);
  });
});
