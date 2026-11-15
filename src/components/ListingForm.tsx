"use client";
/**
 * The listing details form, shared by "Add a listing" (Save draft) and "Edit listing" (Save changes).
 * Publishing is a separate step on the listing page, so saving never changes what planners see by accident.
 * The server checks every field; errors appear next to the field they belong to and nothing typed is lost.
 */
import { useActionState } from "react";
import type { ListingFormState } from "@/app/actions/owner";
import { BOROUGHS } from "@/lib/areas";
import { EVENT_TYPES, EVENT_TYPE_LABELS, PRICING_LABELS, PRICING_MODELS } from "@/lib/domain";
import type { ListingRow } from "@/lib/services/listings";
import { InfoTip } from "@/components/InfoTip";

const pounds = (p?: number | null) => (p == null ? "" : (p / 100).toFixed(p % 100 === 0 ? 0 : 2));

export function ListingForm({ listing, action, submitLabel, hint, sections = false, step, next }: {
  listing?: ListingRow;
  action: (prev: ListingFormState, form: FormData) => Promise<ListingFormState>;
  submitLabel: string;
  hint?: string;
  /** Edit page: split into "Details" and "Prices" sections (ids #details and #prices), each with its own Save. */
  sections?: boolean;
  /** Setting up a draft in steps (Phase 4): stay on this step after saving… */
  step?: string;
  /** …or save and go on to the next step ("Next: …"). */
  next?: { key: string; label: string };
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {}, values: null });
  const e = state.errors;
  const v = state.values;
  const val = (key: string, fallback: string | number | null | undefined) => (v ? String(v[key] ?? "") : fallback == null ? "" : String(fallback));
  const suits = v ? (v.suits as string[]) : listing?.suits ?? [];
  const err = (key: string) => (e[key] ? <p className="field-error" id={`${key}-error`}>{e[key]}</p> : null);
  const aria = (key: string, hintId?: string) => ({
    "aria-invalid": e[key] ? true : undefined,
    "aria-describedby": [e[key] ? `${key}-error` : null, hintId].filter(Boolean).join(" ") || undefined,
  });
  // Re-mount the inputs after a failed save so defaultValue shows what was submitted.
  const k = v ? JSON.stringify(v) : "initial";
  const count = Object.keys(e).filter((x) => x !== "form").length;

  return (
    <form action={formAction} className="panel listing-form" noValidate key={k} id={sections ? "details" : undefined}>
      {listing && <input type="hidden" name="listingId" value={listing.id} />}
      {step && <input type="hidden" name="step" value={step} />}
      {(e.form || count > 0) && (
        <div className="notice error" role="alert">{e.form ?? `Check ${count === 1 ? "the highlighted field" : `the ${count} highlighted fields`} below.`}</div>
      )}

      <fieldset>
        <legend>About the space</legend>
        <div className="grid-2">
          <div className="field"><label htmlFor="name">Listing name</label><input id="name" name="name" type="text" required defaultValue={val("name", listing?.name)} {...aria("name")} />{err("name")}</div>
          <div className="field"><div className="label-row"><label htmlFor="venueType">Kind of space</label><InfoTip id="venueType-hint">e.g. Warehouse studio, Private dining room</InfoTip></div><input id="venueType" name="venueType" type="text" required defaultValue={val("venueType", listing?.venue_type)} {...aria("venueType", "venueType-hint")} />{err("venueType")}</div>
        </div>
        <div className="field"><div className="label-row"><label htmlFor="description">Description</label><InfoTip id="description-hint">What it’s like and what it’s good for. Planners read this on your venue page.</InfoTip></div><textarea id="description" name="description" maxLength={1000} defaultValue={val("description", listing?.description)} {...aria("description", "description-hint")} />{err("description")}</div>
        <fieldset className="inline-set">
          <legend className="label">Good for</legend>
          <div className="choice-row">
            {EVENT_TYPES.filter((t) => t !== "other").map((t) => (
              <label key={t} className="choice"><input type="checkbox" name="suits" value={t} defaultChecked={suits.includes(t)} /> {EVENT_TYPE_LABELS[t]}</label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <fieldset>
        <legend>Location and access</legend>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="borough">Borough</label>
            <select id="borough" name="borough" required defaultValue={val("borough", listing?.borough)} {...aria("borough")}>
              <option value="" disabled>Choose…</option>
              {BOROUGHS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            {err("borough")}
          </div>
          <div className="field"><div className="label-row"><label htmlFor="neighbourhood">Neighbourhood</label><InfoTip id="neighbourhood-hint">What planners call the area, e.g. Shoreditch</InfoTip></div><input id="neighbourhood" name="neighbourhood" type="text" defaultValue={val("neighbourhood", listing?.neighbourhood)} {...aria("neighbourhood", "neighbourhood-hint")} />{err("neighbourhood")}</div>
        </div>
        <div className="field mb-0"><div className="label-row"><label htmlFor="accessNotes">Access notes</label><InfoTip id="accessNotes-hint">Entrances, steps, lifts, toilets. Helps planners with access needs.</InfoTip></div><textarea id="accessNotes" name="accessNotes" style={{ minHeight: 70 }} defaultValue={val("accessNotes", listing?.access_notes)} {...aria("accessNotes", "accessNotes-hint")} />{err("accessNotes")}</div>
      </fieldset>

      <fieldset aria-describedby={e.capacity ? "capacity-error" : "capacity-hint"}>
        <legend><span className="label-row legend-row">Capacity by layout<InfoTip id="capacity-hint">Leave a layout blank if you don’t offer it. Planners are only matched to layouts you’ve filled in.</InfoTip></span></legend>
        <div className="grid-3">
          <div><label htmlFor="capacityStanding">Standing</label><input id="capacityStanding" name="capacityStanding" type="number" inputMode="numeric" min={1} defaultValue={val("capacityStanding", listing?.capacity_standing)} aria-invalid={e.capacity ? true : undefined} /></div>
          <div><label htmlFor="capacitySeated">Seated</label><input id="capacitySeated" name="capacitySeated" type="number" inputMode="numeric" min={1} defaultValue={val("capacitySeated", listing?.capacity_seated)} aria-invalid={e.capacity ? true : undefined} /></div>
          <div><label htmlFor="capacityMixed">Mixed</label><input id="capacityMixed" name="capacityMixed" type="number" inputMode="numeric" min={1} defaultValue={val("capacityMixed", listing?.capacity_mixed)} aria-invalid={e.capacity ? true : undefined} /></div>
        </div>
        {err("capacity")}
      </fieldset>

      {sections && (
        <div className="actions section-save">
          <button className="btn secondary" type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? "Saving…" : "Save details"}</button>
        </div>
      )}

      <fieldset id={sections ? "prices" : undefined} className={sections ? "section-anchor" : undefined}>
        <legend>Price</legend>
        <div className="grid-2">
          <div>
            <label htmlFor="pricingModel">How you charge</label>
            <select id="pricingModel" name="pricingModel" defaultValue={val("pricingModel", listing?.pricing_model ?? "hire_fee")}>
              {PRICING_MODELS.map((m) => <option key={m} value={m}>{PRICING_LABELS[m]}</option>)}
            </select>
          </div>
          <div><div className="label-row"><label htmlFor="price">Amount (£)</label><InfoTip id="price-hint">Per guest if you charge per head</InfoTip></div><input id="price" name="price" type="text" inputMode="decimal" required defaultValue={val("price", pounds(listing?.price_pence))} {...aria("price", "price-hint")} />{err("price")}</div>
        </div>
      </fieldset>

      <div className="actions">
        {next ? (
          <>
            <button className="btn" type="submit" name="goto" value={next.key} disabled={pending} aria-busy={pending || undefined}>{pending ? "Saving…" : `Next: ${next.label}`}</button>
            <button className="btn secondary" type="submit" disabled={pending}>{submitLabel}</button>
          </>
        ) : (
          <button className="btn" type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? "Saving…" : submitLabel}</button>
        )}
        {hint && <span className="small muted">{hint}</span>}
      </div>
    </form>
  );
}
