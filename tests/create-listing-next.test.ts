/** Fix 3: step 1 of Add a listing has "Next: Facilities and extras" and "Save draft"; both create the draft. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const createListing = vi.fn(async () => "11111111-2222-3333-4444-555555555555");
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`); });
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("@/lib/db", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/auth/session", () => ({ getActor: async () => ({ id: "owner-1", role: "owner" }) }));
vi.mock("@/lib/services/listings", async (orig) => ({ ...(await orig<typeof import("@/lib/services/listings")>()), createListing: (...a: unknown[]) => createListing(...(a as [])) }));

const form = (extra: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ name: "Test Loft", venueType: "Loft", borough: "Hackney", pricingModel: "hire_fee", price: "900", capacityStanding: "40", ...extra })) f.set(k, v);
  return f;
};

describe("Add a listing, step 1", () => {
  beforeEach(() => { createListing.mockClear(); redirect.mockClear(); });

  it("'Next: Facilities and extras' creates the draft and opens step 2", async () => {
    const { createListingAction } = await import("@/app/actions/owner");
    await expect(createListingAction({ errors: {}, values: null }, form({ goto: "facilities" }))).rejects.toThrow(/REDIRECT/);
    expect(createListing).toHaveBeenCalledTimes(1);
    expect(redirect.mock.calls[0][0]).toMatch(/^\/owner\/listings\/11111111-2222-3333-4444-555555555555\?step=facilities&ok=Draft\+saved/);
  });

  it("'Save draft' creates the draft and returns to Manage listings", async () => {
    const { createListingAction } = await import("@/app/actions/owner");
    await expect(createListingAction({ errors: {}, values: null }, form())).rejects.toThrow(/REDIRECT/);
    expect(createListing).toHaveBeenCalledTimes(1);
    expect(redirect.mock.calls[0][0]).toMatch(/^\/owner\?ok=Draft\+saved\.\+Continue\+setup/);
  });

  it("both run the same checks: a missing name saves nothing", async () => {
    const { createListingAction } = await import("@/app/actions/owner");
    for (const extra of [{ goto: "facilities", name: "" }, { name: "" }] as Record<string, string>[]) {
      const result = await createListingAction({ errors: {}, values: null }, form(extra));
      expect(result.errors.name).toBeTruthy();
    }
    expect(createListing).not.toHaveBeenCalled();
  });
});
