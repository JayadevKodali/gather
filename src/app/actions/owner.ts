"use server";
import { redirect } from "next/navigation";
import { attempt, intOrNull, poundsToPence, text, withParam } from "@/lib/actions-util";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { EVENT_TYPES, FACILITY_CODES } from "@/lib/domain";
import { createListing, ListingInputSchema, setDays, setFacilities, setPublished, updateListing } from "@/lib/services/listings";
import { ServiceError } from "@/lib/services/errors";
import { isSetupStep } from "@/lib/listing-setup";
import { listPhotos, movePhoto, removePhoto, reorderPhotos, setCover } from "@/lib/services/photos";

function readListing(form: FormData) {
  return {
    name: text(form, "name"),
    description: text(form, "description"),
    borough: text(form, "borough"),
    neighbourhood: text(form, "neighbourhood"),
    venueType: text(form, "venueType"),
    suits: form.getAll("suits").map(String).filter((s) => (EVENT_TYPES as readonly string[]).includes(s)),
    capacityStanding: intOrNull(text(form, "capacityStanding")),
    capacitySeated: intOrNull(text(form, "capacitySeated")),
    capacityMixed: intOrNull(text(form, "capacityMixed")),
    pricingModel: text(form, "pricingModel"),
    pricePence: poundsToPence(text(form, "price")) ?? NaN,
    accessNotes: text(form, "accessNotes"),
  };
}

export type ListingFormState = { errors: Record<string, string>; values: Record<string, string | string[]> | null };

const FIELD_FOR: Record<string, string> = { pricePence: "price", capacityStanding: "capacity", capacitySeated: "capacity", capacityMixed: "capacity" };

/** Every problem at once, keyed by form field, so the form can show each one next to its input. */
function listingErrors(input: ReturnType<typeof readListing>): Record<string, string> {
  const parsed = ListingInputSchema.safeParse(input);
  if (parsed.success) return {};
  const errors: Record<string, string> = {};
  // The "at least one capacity" rule only runs once the other fields pass, so check it up front too.
  if (!input.capacityStanding && !input.capacitySeated && !input.capacityMixed) errors.capacity = "Enter at least one capacity (standing, seated or mixed)";
  for (const issue of parsed.error.issues) {
    const key = issue.path.length ? FIELD_FOR[String(issue.path[0])] ?? String(issue.path[0]) : "capacity";
    errors[key] ??= key === "price" && /number/i.test(issue.message) ? "Enter a price in pounds, e.g. 1200" : issue.message;
  }
  return errors;
}

const echo = (form: FormData) => {
  const values: Record<string, string | string[]> = {};
  for (const k of ["name", "description", "borough", "neighbourhood", "venueType", "capacityStanding", "capacitySeated", "capacityMixed", "pricingModel", "price", "accessNotes"]) values[k] = String(form.get(k) ?? "");
  values.suits = form.getAll("suits").map(String);
  return values;
};

async function saveListing(form: FormData, op: (input: ReturnType<typeof readListing>) => Promise<unknown>): Promise<ListingFormState | null> {
  const input = readListing(form);
  const errors = listingErrors(input);
  if (Object.keys(errors).length) return { errors, values: echo(form) };
  try {
    await op(input);
    return null;
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.code === "unauthenticated") redirect("/login");
      return { errors: { form: error.message }, values: echo(form) };
    }
    throw error;
  }
}

/**
 * Setting up a draft in steps (Phase 4): forms on a step page send `step` (stay on this step) and, from
 * "Next: …", `goto` (the step to show next). Anything else is ignored, and the full page is shown.
 */
function listingPage(id: string, form: FormData) {
  const goto = text(form, "goto");
  const step = text(form, "step");
  const show = isSetupStep(goto) ? goto : isSetupStep(step) || step === "all" ? step : "";
  return show ? withParam(`/owner/listings/${id}`, "step", show) : `/owner/listings/${id}`;
}

export async function createListingAction(_prev: ListingFormState, form: FormData): Promise<ListingFormState> {
  const db = await getDb();
  const actor = await getActor();
  let id = "";
  const failed = await saveListing(form, async (input) => { id = await createListing(db, actor, input); });
  if (failed) return failed;
  // "Next: Facilities and extras" opens step 2; "Save draft" goes back to Manage listings (fix 3).
  if (text(form, "goto") === "facilities") redirect(withParam(withParam(`/owner/listings/${id}`, "step", "facilities"), "ok", "Draft saved. Next, confirm your facilities and extras."));
  redirect(withParam("/owner", "ok", "Draft saved. Continue setup when you’re ready."));
}

export async function updateListingAction(_prev: ListingFormState, form: FormData): Promise<ListingFormState> {
  const id = text(form, "listingId");
  const db = await getDb();
  const actor = await getActor();
  const failed = await saveListing(form, (input) => updateListing(db, actor, id, input));
  if (failed) return failed;
  redirect(withParam(listingPage(id, form), "ok", text(form, "goto") ? "Details saved." : "Changes saved."));
}

export async function togglePublishedAction(form: FormData) {
  const id = text(form, "listingId");
  const publish = text(form, "publish") === "1";
  const back = text(form, "back") === "listing" ? listingPage(id, form) : "/owner";
  const db = await getDb();
  const actor = await getActor();
  await attempt(() => setPublished(db, actor, id, publish), back);
  redirect(withParam(back, "ok", publish ? "Published. Planners can now find this listing." : "Unpublished. The listing is hidden from planner searches."));
}

const photoBack = (path: string, key: string, message: string) => `${withParam(path, key, message)}#photos`;

export async function photoAction(form: FormData) {
  const id = text(form, "listingId");
  const photoId = text(form, "photoId");
  const op = text(form, "op");
  const db = await getDb();
  const actor = await getActor();
  const back = listingPage(id, form);
  let coverChanged = false;
  if (op === "cover") await attempt(() => setCover(db, actor, id, photoId), back);
  else if (op === "left" || op === "right") {
    await attempt(() => movePhoto(db, actor, id, photoId, op === "left" ? -1 : 1), back); // owner checked here
    // An arrow that moves a photo into or out of first place changes the cover: say so.
    const [first] = await listPhotos(db, id);
    coverChanged = op === "left" ? first?.id === photoId : first?.id !== photoId && text(form, "wasCover") === "1";
  }
  else if (op === "remove") await attempt(() => removePhoto(db, actor, id, photoId), back);
  else if (op === "reorder") await attempt(() => reorderPhotos(db, actor, id, text(form, "order").split(",").filter(Boolean)), back);
  redirect(photoBack(back, "ok", op === "cover" || coverChanged ? "Cover photo updated." : op === "remove" ? "Photo removed." : "Photo order updated."));
}

export async function saveFacilitiesAction(form: FormData) {
  const id = text(form, "listingId");
  const input: Record<string, unknown> = {};
  for (const code of FACILITY_CODES) {
    const state = text(form, `state_${code}`) || "unknown";
    const charge = text(form, `charge_${code}`) || "included";
    const price = poundsToPence(text(form, `price_${code}`));
    input[code] = { state, charge, pricePence: price === null || Number.isNaN(price) ? null : price, note: text(form, `note_${code}`) };
  }
  const db = await getDb();
  const actor = await getActor();
  const page = listingPage(id, form);
  await attempt(() => setFacilities(db, actor, id, input), `${page}#facilities`);
  redirect(`${withParam(page, "ok", "Facilities and extras saved.")}#facilities`);
}

export async function setDaysAction(form: FormData) {
  const id = text(form, "listingId");
  const month = text(form, "month");
  const back = `/owner/listings/${id}/calendar${month ? `?month=${month}` : ""}`;
  const db = await getDb();
  const actor = await getActor();
  const from = text(form, "from");
  const to = text(form, "to") || from;
  const state = text(form, "state") as "open" | "blocked" | "clear";
  const weekdays = form.getAll("weekdays").map(Number).filter((n) => n >= 0 && n <= 6);
  const n = await attempt(() => setDays(db, actor, id, { from, to, state, weekdays }), back);
  const verb = state === "open" ? "opened" : state === "blocked" ? "blocked" : "cleared";
  redirect(withParam(back, "ok", n === 1 ? `${from} ${verb}.` : `${n} days ${verb}.`));
}
