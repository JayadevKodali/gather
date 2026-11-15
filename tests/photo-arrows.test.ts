/** Fix 2: the photo tiles use arrow buttons with clear names; the words "Earlier" and "Later" are gone. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/owner", () => ({ photoAction: async () => undefined }));

const photo = (id: string, position: number) => ({ id, listing_id: "l1", storage_key: "k", width: 1600, height: 1200, bytes: 1, position, created_at: new Date() });

describe("photo tiles", () => {
  it("render arrows named 'Move photo N up/down the order', a number badge, and no 'Earlier' or 'Later'", async () => {
    const { PhotoManager } = await import("@/components/PhotoManager");
    const html = renderToStaticMarkup(createElement(PhotoManager, {
      listingId: "l1", slug: "not-seeded", name: "Test Room", published: false, available: { ok: true },
      photos: [photo("p1", 0), photo("p2", 1), photo("p3", 2)] as never,
    }));
    expect(html).not.toMatch(/>\s*Earlier\s*</);
    expect(html).not.toMatch(/>\s*Later\s*</);
    expect(html).not.toMatch(/Earlier|Later/);
    for (const n of [1, 2, 3]) {
      expect(html).toContain(`aria-label="Move photo ${n} up the order"`);
      expect(html).toContain(`aria-label="Move photo ${n} down the order"`);
      expect(html).toContain(`title="Move photo ${n} up the order"`);
    }
    // The first photo can't go up and the last can't go down.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Move photo 1 up the order"|<button[^>]*aria-label="Move photo 1 up the order"[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Move photo 3 down the order"|<button[^>]*aria-label="Move photo 3 down the order"[^>]*disabled=""/);
    expect(html.match(/class="photo-num"/g)).toHaveLength(3);
    expect(html).toContain("Drag a photo by its handle to reorder, or use the arrows. The first photo is the cover.");
  });
});
