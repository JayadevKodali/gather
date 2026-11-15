/**
 * Setting up a new listing in five steps (design pass, Phase 4). Each step's "done" is worked out from
 * what's already saved, so nothing new is stored and an owner can leave and come back at any point:
 *
 *   1. Details and price    done once the listing exists (they're required to save it)
 *   2. Facilities and extras done once the facilities form has been saved, even with nothing marked
 *                           (saving stores every answer, "Not confirmed" included)
 *   3. Photos               done with an uploaded photo, or the listing's original photos
 *   4. Dates                done with at least one open date from today
 *   5. Review and publish   done when the listing is live
 *
 * The rule for publishing is unchanged: it needs a photo (the server checks that).
 */
export const SETUP_STEPS = [
  { key: "details", label: "Details and price", short: "Details" },
  { key: "facilities", label: "Facilities and extras", short: "Facilities" },
  { key: "photos", label: "Photos", short: "Photos" },
  { key: "dates", label: "Dates", short: "Dates" },
  { key: "publish", label: "Review and publish", short: "Publish" },
] as const;

export type SetupStepKey = (typeof SETUP_STEPS)[number]["key"];

export interface SetupFacts { facilitiesSaved: boolean; hasPhoto: boolean; openDays: number; published: boolean }

export function setupProgress(f: SetupFacts) {
  const done: Record<SetupStepKey, boolean> = {
    details: true,
    facilities: f.facilitiesSaved,
    photos: f.hasPhoto,
    dates: f.openDays > 0,
    publish: f.published,
  };
  const steps = SETUP_STEPS.map((s) => ({ ...s, done: done[s.key] }));
  const doneCount = steps.filter((s) => s.done).length;
  // Resume at the first step that isn't done (publishing comes last, whatever else is left).
  const firstOpen = steps.find((s) => !s.done && s.key !== "publish") ?? steps[steps.length - 1];
  /** What still stands between this draft and planners, in plain words (publishing is the owner's choice). */
  const needed = [
    !f.hasPhoto && "at least one photo (required to publish)",
    f.openDays === 0 && "open dates (planners only see open dates)",
    !f.facilitiesSaved && "your facilities and extras",
  ].filter(Boolean) as string[];
  return { steps, doneCount, total: steps.length, resume: firstOpen.key as SetupStepKey, needed };
}

export function isSetupStep(v: unknown): v is SetupStepKey {
  return typeof v === "string" && SETUP_STEPS.some((s) => s.key === v);
}

export function nextStep(key: SetupStepKey) {
  const i = SETUP_STEPS.findIndex((s) => s.key === key);
  return SETUP_STEPS[i + 1] ?? null;
}
