/** Phase 4: a new listing's five setup steps, worked out from what's saved. */
import { describe, expect, it } from "vitest";
import { beforeAll } from "vitest";
import { isSetupStep, nextStep, setupProgress } from "@/lib/listing-setup";
import { createPgliteDb, migrate, type Db } from "@/lib/db";
import { FACILITY_CODES } from "@/lib/domain";
import { seedAccountsAndVenues } from "@/lib/seed";
import type { Actor } from "@/lib/services/errors";
import { createListing, getFacilities, setFacilities } from "@/lib/services/listings";

const fresh = { facilitiesSaved: false, hasPhoto: false, openDays: 0, published: false };

describe("listing setup steps", () => {
  it("a brand-new draft has 1 of 5 done and resumes at Facilities", () => {
    const p = setupProgress(fresh);
    expect(p.doneCount).toBe(1);
    expect(p.total).toBe(5);
    expect(p.resume).toBe("facilities");
    expect(p.needed).toEqual(["at least one photo (required to publish)", "open dates (planners only see open dates)", "your facilities and extras"]);
  });

  it("resumes at the first unfinished step", () => {
    expect(setupProgress({ ...fresh, facilitiesSaved: true }).resume).toBe("photos");
    expect(setupProgress({ ...fresh, facilitiesSaved: true, hasPhoto: true }).resume).toBe("dates");
    expect(setupProgress({ ...fresh, hasPhoto: true }).resume).toBe("facilities");
  });

  it("with everything but publishing done, it resumes at Review and publish (4 of 5)", () => {
    const p = setupProgress({ facilitiesSaved: true, hasPhoto: true, openDays: 3, published: false });
    expect(p.resume).toBe("publish");
    expect(p.doneCount).toBe(4);
    expect(p.needed).toEqual([]);
  });

  it("a live listing is 5 of 5", () => {
    expect(setupProgress({ facilitiesSaved: true, hasPhoto: true, openDays: 3, published: true }).doneCount).toBe(5);
  });

  it("knows its steps and what comes next", () => {
    expect(isSetupStep("photos")).toBe(true);
    expect(isSetupStep("nope")).toBe(false);
    expect(nextStep("details")?.key).toBe("facilities");
    expect(nextStep("publish")).toBeNull();
  });
});

describe("saving the facilities step with nothing marked (fix 1)", () => {
  let db: Db;
  let owner: Actor;
  beforeAll(async () => {
    db = await createPgliteDb();
    await migrate(db);
    owner = (await seedAccountsAndVenues(db, "test-password-123")).get("owner@gather.test")!;
  });

  it("records every answer as 'not confirmed', so step 2 counts as done and setup resumes at Photos", async () => {
    const id = await createListing(db, owner, { name: "Defaults Room", venueType: "Room", borough: "Hackney", pricingModel: "hire_fee", pricePence: 50_000, capacityStanding: 40, capacitySeated: null, capacityMixed: null });
    expect(Object.keys(await getFacilities(db, id))).toHaveLength(0);
    await setFacilities(db, owner, id, Object.fromEntries(FACILITY_CODES.map((c) => [c, { state: "unknown", charge: "included", pricePence: null, note: "" }])));
    const saved = await getFacilities(db, id);
    expect(Object.keys(saved).sort()).toEqual([...FACILITY_CODES].sort());
    expect(Object.values(saved).every((f) => f!.state === "unknown")).toBe(true);
    const p = setupProgress({ facilitiesSaved: Object.keys(saved).length > 0, hasPhoto: false, openDays: 0, published: false });
    expect(p.steps.find((x) => x.key === "facilities")!.done).toBe(true);
    expect(p.resume).toBe("photos");
  });
});
