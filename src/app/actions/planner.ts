"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { attempt, intOrNull, poundsToPence, text, withParam } from "@/lib/actions-util";
import { resolveArea } from "@/lib/areas";
import { getActor } from "@/lib/auth/session";
import { isSearchable, type BriefFields } from "@/lib/brief/schema";
import { getDb } from "@/lib/db";
import { EVENT_TYPES, FACILITY_CODES } from "@/lib/domain";
import { answerFollowUp, createBrief, getBrief, searchBrief, updateBriefFields } from "@/lib/services/briefs";
import { createEnquiry } from "@/lib/services/enquiries";

export async function createBriefAction(form: FormData) {
  const db = await getDb();
  const actor = await getActor();
  const id = await attempt(() => createBrief(db, actor, text(form, "text")), "/plan");
  redirect(`/plan/${id}`);
}

export async function answerAction(form: FormData) {
  const id = text(form, "briefId");
  const db = await getDb();
  const actor = await getActor();
  const result = await attempt(() => answerFollowUp(db, actor, id, text(form, "answer")), `/plan/${id}`);
  revalidatePath(`/plan/${id}`);
  // A different URL (not just a #hash) so the page re-renders with the updated brief.
  redirect(result.hint ? withParam(`/plan/${id}`, "error", result.hint) : `${withParam(`/plan/${id}`, "answered", "1")}#details`);
}

/** Read the review form into a BriefFields object. Validation happens in the service. */
function readDetails(form: FormData, previous: BriefFields): BriefFields {
  const areaText = text(form, "area");
  const guests = intOrNull(text(form, "guests"));
  const budgetMode = text(form, "budgetMode") as BriefFields["budget"]["mode"];
  const amount = poundsToPence(text(form, "budgetAmount"));
  const eventType = text(form, "eventType");
  const facilities: BriefFields["facilities"] = {};
  for (const code of FACILITY_CODES) {
    const level = text(form, `fac_${code}`);
    if (level === "essential" || level === "preferred") facilities[code] = level;
  }
  return {
    date: text(form, "date") || null,
    dateText: text(form, "date") ? null : previous.dateText,
    guests,
    guestsRange: previous.guestsRange && previous.guestsRange[1] === guests ? previous.guestsRange : null,
    layout: (["standing", "seated", "mixed"].includes(text(form, "layout")) ? text(form, "layout") : null) as BriefFields["layout"],
    areaText: areaText || null,
    boroughs: resolveArea(areaText),
    budget:
      budgetMode === "none" || amount === null
        ? { mode: "none", amountPence: null, basis: "total" }
        : { mode: budgetMode, amountPence: amount, basis: text(form, "budgetBasis") === "per_head" ? "per_head" : "total" },
    eventType: (EVENT_TYPES as readonly string[]).includes(eventType) ? (eventType as BriefFields["eventType"]) : null,
    facilities,
    conflicts: [],
  };
}

export async function saveDetailsAction(form: FormData) {
  const id = text(form, "briefId");
  const db = await getDb();
  const actor = await getActor();
  const brief = await attempt(() => getBrief(db, actor, id), "/plan");
  const fields = readDetails(form, brief.confirmed);
  if (fields.areaText && fields.boroughs.length === 0) {
    redirect(withParam(`/plan/${id}`, "error", `We don't recognise “${fields.areaText}” as a London area. Try a neighbourhood like Shoreditch or a borough like Southwark, or leave it blank.`));
  }
  const confirmed = await attempt(() => updateBriefFields(db, actor, id, fields), `/plan/${id}`);
  if (!isSearchable(confirmed)) {
    redirect(withParam(`/plan/${id}`, "error", "Add the date, guest count and layout so we can check availability and capacity."));
  }
  await attempt(() => searchBrief(db, actor, id), `/plan/${id}`);
  redirect(`/plan/${id}/results`);
}

export async function enquireAction(form: FormData) {
  const briefId = text(form, "briefId");
  const listingId = text(form, "listingId");
  const db = await getDb();
  const actor = await getActor();
  const enquiryId = await attempt(
    () => createEnquiry(db, actor, { briefId, listingId, extras: form.getAll("extras").map(String), message: text(form, "message") }),
    `/venues/${listingId}?brief=${briefId}`,
  );
  redirect(`/enquiries/${enquiryId}?ok=${encodeURIComponent("Enquiry sent. We've emailed the venue with a link to it.")}`);
}
