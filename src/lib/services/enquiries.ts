/**
 * Enquiries, messages and quotes — the conversation between one planner and one venue owner.
 *
 * Access: only the planner who sent the enquiry and the owner of the listing can read or act
 * on it. Admins see counts on the dashboard, not private messages.
 *
 * Quotes are versioned and immutable: a revision creates a NEW row with a new reference and
 * marks the old one superseded. Only the single active quote can be paid.
 */
import { z } from "zod";
import type { Db } from "@/lib/db";
import { notify } from "@/lib/adapters/email";
import { balanceDueDate, cancellationTerms, DEFAULT_BALANCE_DUE_DAYS, DEFAULT_CUTOFF_DAYS } from "@/lib/payments/policy";
import { budgetTotalPence, isSearchable, type BriefFields, type ConfirmedBrief } from "@/lib/brief/schema";
import { FACILITY_LABELS, type FacilityCode } from "@/lib/domain";
import { hardRuleFailures } from "@/lib/matching/eligibility";
import { basePrice, formatPounds } from "@/lib/matching/pricing";
import { longDate } from "@/lib/format";
import { track } from "./analytics";
import { getBrief } from "./briefs";
import { conflict, forbidden, invalid, notFound, requireRole, shortCode, type Actor } from "./errors";
import { getFacilities, getListing, loadMatchVenues } from "./listings";

export interface SelectedExtra {
  code: FacilityCode;
  label: string;
  charge: "priced" | "to_confirm";
  pricePence: number | null;
}

export interface EnquiryRow {
  id: string;
  reference: string;
  brief_id: string;
  planner_id: string;
  listing_id: string;
  event_date: string;
  guests: number;
  layout: "standing" | "seated" | "mixed";
  brief_snapshot: BriefFields & { rawText: string };
  selected_extras: SelectedExtra[];
  status: "awaiting_venue" | "info_requested" | "quoted" | "declined_by_venue" | "declined_by_planner" | "booked";
  first_reply_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface QuoteLine {
  label: string;
  amountPence: number;
}

export interface QuoteRow {
  id: string;
  enquiry_id: string;
  reference: string;
  version: number;
  lines: QuoteLine[];
  total_pence: number;
  deposit_pence: number;
  status: "active" | "superseded" | "declined" | "paid";
  sent_at: Date;
  /** Terms agreed with this quote (null on quotes sent before terms existed). */
  balance_due_days: number | null;
  cancellation_cutoff_days: number | null;
  cancellation_terms: string | null;
}

const STATUS_LABELS: Record<EnquiryRow["status"], string> = {
  awaiting_venue: "Awaiting venue reply",
  info_requested: "Venue asked a question",
  quoted: "Quote received",
  declined_by_venue: "Declined by venue",
  declined_by_planner: "Declined by planner",
  booked: "Booked",
};
/** What each side reads as the enquiry's status. The venue sent the quote, so it reads "Quote sent". */
export const enquiryStatusLabel = (s: EnquiryRow["status"], viewer: "planner" | "owner" = "planner") =>
  viewer === "owner" && s === "quoted" ? "Quote sent" : STATUS_LABELS[s];

/**
 * The cancellation terms as the venue reads them. The stored text (saved on the quote and the booking, and
 * shown to the planner) is written to the planner ("your deposit"); this rewords it for the venue's own pages.
 * Display only: the stored text never changes. Text that isn't in the standard wording is returned unchanged.
 */
export function termsForViewer(terms: string, viewer: "planner" | "owner"): string {
  if (viewer === "planner") return terms;
  return terms
    .replace(/If you cancel (\d+) or more days before the event, your deposit is refunded\./, "If the planner cancels $1 or more days before the event, the planner's deposit is refunded.")
    .replace(/If you cancel (on the day of the event|\d+ days? or fewer before the event), the venue keeps the deposit\./, "If the planner cancels $1, you keep the deposit.")
    .replace("Any balance you've paid through Gather is always refunded.", "Any balance the planner has paid through Gather is always refunded.")
    .replace("If the venue cancels, you get everything back.", "If you cancel, the planner gets everything back.");
}

// ---------- Create ----------

export async function createEnquiry(
  db: Db,
  actor: Actor | null,
  input: { briefId: string; listingId: string; extras: string[]; message: string },
): Promise<string> {
  const planner = requireRole(actor, "planner");
  const brief = await getBrief(db, planner, input.briefId);
  if (!isSearchable(brief.confirmed)) throw invalid("Confirm the event details before sending an enquiry.");
  const confirmed = brief.confirmed as ConfirmedBrief;
  const listing = await getListing(db, input.listingId);
  if (!listing || !listing.is_published) throw notFound("That venue isn't available.");

  // Re-check the hard rules against fresh data: the shortlist on screen may be stale.
  const [venue] = await loadMatchVenues(db, [listing.id]);
  const failures = venue ? hardRuleFailures(venue, confirmed) : [{ code: "unpublished" as const }];
  if (failures.length) throw conflict("This venue no longer fits your brief (its availability or details changed). Please search again.");

  const existing = await db.query<{ id: string }>(
    "select id from enquiries where brief_id = $1 and listing_id = $2 and status not in ('declined_by_venue', 'declined_by_planner')",
    [brief.id, listing.id],
  );
  if (existing[0]) return existing[0].id; // already sent: don't duplicate

  const facilities = await getFacilities(db, listing.id);
  const extras: SelectedExtra[] = [];
  const wanted = new Set([
    ...input.extras,
    // Priced essentials are always included so the cost the planner saw is the cost quoted.
    ...Object.entries(confirmed.facilities).filter(([, l]) => l === "essential").map(([c]) => c),
  ]);
  for (const code of wanted) {
    const f = facilities[code as FacilityCode];
    if (!f || f.state !== "yes" || f.charge === "included") continue;
    extras.push({ code: code as FacilityCode, label: FACILITY_LABELS[code as FacilityCode], charge: f.charge, pricePence: f.pricePence });
  }

  const message = String(input.message ?? "").trim().slice(0, 2000);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      `insert into enquiries (reference, brief_id, planner_id, listing_id, event_date, guests, layout, brief_snapshot, selected_extras)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) returning id`,
      [`ENQ-${shortCode()}`, brief.id, planner.id, listing.id, confirmed.date, confirmed.guests, confirmed.layout,
       JSON.stringify({ ...confirmed, rawText: brief.raw_text }), JSON.stringify(extras)],
    );
    if (message) {
      await tx.query("insert into messages (enquiry_id, author_id, body) values ($1, $2, $3)", [row.id, planner.id, message]);
    }
    return row.id;
  });

  const [owner] = await db.query<{ email: string }>("select email from profiles where id = $1", [listing.owner_id]);
  await notify(db, { toEmail: owner.email, toRole: "owner", template: "enquiry_received", subject: `New enquiry for ${listing.name}`, path: `/enquiries/${id}` });
  await track(db, "enquiry_sent", planner.id, { enquiryId: id, listingId: listing.id });
  return id;
}

// ---------- Read ----------

/** Load an enquiry and check the signed-in person is one of its two participants. */
export async function getEnquiryForParticipant(db: Db, actor: Actor | null, id: string) {
  const user = requireRole(actor, "planner", "owner");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Enquiry not found.");
  const [enquiry] = await db.query<EnquiryRow>("select * from enquiries where id = $1", [id]);
  if (!enquiry) throw notFound("Enquiry not found.");
  const listing = (await getListing(db, enquiry.listing_id))!;
  const isPlanner = user.role === "planner" && enquiry.planner_id === user.id;
  const isOwner = user.role === "owner" && listing.owner_id === user.id;
  if (!isPlanner && !isOwner) throw forbidden("Only the planner and the venue owner can open this enquiry.");
  return { enquiry, listing, side: isPlanner ? ("planner" as const) : ("owner" as const) };
}

export async function getEnquiryThread(db: Db, actor: Actor | null, id: string) {
  const base = await getEnquiryForParticipant(db, actor, id);
  const [planner] = await db.query<{ full_name: string; email: string }>("select full_name, email from profiles where id = $1", [base.enquiry.planner_id]);
  const [owner] = await db.query<{ full_name: string; email: string }>("select full_name, email from profiles where id = $1", [base.listing.owner_id]);
  const messages = await db.query<{ id: string; author_id: string; body: string; quote_id: string | null; created_at: Date; author_name: string; author_role: string }>(
    `select m.*, p.full_name as author_name, p.role as author_role from messages m join profiles p on p.id = m.author_id
     where enquiry_id = $1 order by created_at`,
    [id],
  );
  const quotes = await db.query<QuoteRow>("select * from quotes where enquiry_id = $1 order by version desc", [id]);
  const checkouts = await db.query<{ id: string; quote_id: string; status: string; failure_reason: string | null; amount_pence: number; created_at: Date; expires_at: Date }>(
    "select id, quote_id, status, failure_reason, amount_pence, created_at, expires_at from checkouts where enquiry_id = $1 and kind = 'deposit' order by created_at desc",
    [id],
  );
  const [booking] = await db.query<{ id: string; reference: string; total_pence: number; deposit_pence: number; confirmed_at: Date; quote_id: string; status: "confirmed" | "cancelled" }>(
    "select id, reference, total_pence, deposit_pence, confirmed_at, quote_id, status from bookings where enquiry_id = $1",
    [id],
  );
  return { ...base, planner, owner, messages, quotes, checkouts, booking: booking ?? null };
}

export async function listEnquiries(db: Db, actor: Actor | null, opts: { search?: string } = {}) {
  const user = requireRole(actor, "planner", "owner");
  const search = opts.search?.trim() ? `%${opts.search.trim().toLowerCase()}%` : null;
  const scope = user.role === "planner" ? "e.planner_id = $1" : "l.owner_id = $1";
  return db.query<EnquiryRow & { listing_name: string; planner_name: string; latest_quote_ref: string | null; quote_refs: string | null; latest_total: number | null; booking_status: "confirmed" | "cancelled" | null }>(
    `select e.*, l.name as listing_name, p.full_name as planner_name,
       -- A booked enquiry's booking may since have been cancelled; the lists show that (design pass).
       (select b.status from bookings b where b.enquiry_id = e.id order by (b.status = 'confirmed') desc limit 1) as booking_status,
       (select reference from quotes q where q.enquiry_id = e.id order by version desc limit 1) as latest_quote_ref,
       (select total_pence from quotes q where q.enquiry_id = e.id order by version desc limit 1) as latest_total,
       (select string_agg(reference, ' ') from quotes q where q.enquiry_id = e.id) as quote_refs
     from enquiries e join listings l on l.id = e.listing_id join profiles p on p.id = e.planner_id
     where ${scope}
       and ($2::text is null or lower(e.reference) like $2 or lower(l.name) like $2
            or exists (select 1 from quotes q where q.enquiry_id = e.id and lower(q.reference) like $2))
     order by e.updated_at desc limit 100`,
    [user.id, search],
  );
}

// ---------- Messages ----------

export async function postMessage(db: Db, actor: Actor | null, enquiryId: string, body: string, quoteId?: string | null) {
  const { enquiry, listing, side } = await getEnquiryForParticipant(db, actor, enquiryId);
  const text = String(body ?? "").trim();
  if (!text) throw invalid("Write a message first.");
  if (text.length > 4000) throw invalid("Messages are limited to 4,000 characters.");
  if (quoteId) {
    const [q] = await db.query("select id from quotes where id = $1 and enquiry_id = $2", [quoteId, enquiryId]);
    if (!q) throw invalid("That quote isn't part of this enquiry.");
  }
  await db.transaction(async (tx) => {
    await tx.query("insert into messages (enquiry_id, author_id, body, quote_id) values ($1,$2,$3,$4)", [enquiryId, actor!.id, text, quoteId ?? null]);
    if (side === "owner") {
      await tx.query(
        `update enquiries set first_reply_at = coalesce(first_reply_at, now()), updated_at = now(),
           status = case when status = 'awaiting_venue' then 'info_requested' else status end where id = $1`,
        [enquiryId],
      );
    } else {
      await tx.query("update enquiries set updated_at = now() where id = $1", [enquiryId]);
    }
  });
  if (side === "owner") {
    const [planner] = await db.query<{ email: string }>("select email from profiles where id = $1", [enquiry.planner_id]);
    await notify(db, { toEmail: planner.email, toRole: "planner", template: "venue_replied", subject: `${listing.name} replied to your enquiry`, path: `/enquiries/${enquiryId}` });
    await track(db, "venue_replied", actor!.id, { enquiryId });
  } else {
    const [owner] = await db.query<{ email: string }>("select email from profiles where id = $1", [listing.owner_id]);
    await notify(db, { toEmail: owner.email, toRole: "owner", template: "planner_replied", subject: `New message about ${enquiry.reference}`, path: `/enquiries/${enquiryId}` });
  }
}

export async function declineEnquiry(db: Db, actor: Actor | null, enquiryId: string, reason: string) {
  const { enquiry, listing, side } = await getEnquiryForParticipant(db, actor, enquiryId);
  if (side !== "owner") throw forbidden("Only the venue can decline an enquiry.");
  if (enquiry.status === "booked") throw conflict("This enquiry is already booked.");
  const text = String(reason ?? "").trim() || "Sorry, we can't host this event.";
  await db.transaction(async (tx) => {
    await tx.query("insert into messages (enquiry_id, author_id, body) values ($1,$2,$3)", [enquiryId, actor!.id, text]);
    await tx.query("update quotes set status = 'declined' where enquiry_id = $1 and status = 'active'", [enquiryId]);
    await tx.query("update enquiries set status = 'declined_by_venue', first_reply_at = coalesce(first_reply_at, now()), updated_at = now() where id = $1", [enquiryId]);
  });
  const [planner] = await db.query<{ email: string }>("select email from profiles where id = $1", [enquiry.planner_id]);
  await notify(db, { toEmail: planner.email, toRole: "planner", template: "enquiry_declined", subject: `${listing.name} can't host your event`, path: `/enquiries/${enquiryId}` });
}

// ---------- Quotes ----------

export const QuoteInputSchema = z
  .object({
    lines: z
      .array(z.object({ label: z.string().trim().min(1, "Each line needs a description").max(120), amountPence: z.number().int().min(0).max(100_000_000) }))
      .min(1, "Add at least one line")
      .max(20),
    depositPence: z.number().int(),
    // Optional so older callers still work; the owner's form always sends both.
    balanceDueDays: z.number({ message: "Enter the balance due as a whole number of days." }).int("Enter the balance due as a whole number of days.").min(0, "The balance due date can't be after the event.").max(365, "Use 365 days or fewer.").default(DEFAULT_BALANCE_DUE_DAYS),
    cancellationCutoffDays: z.number({ message: "Enter the cancellation cutoff as a whole number of days." }).int("Enter the cancellation cutoff as a whole number of days.").min(0, "The cancellation cutoff can't be negative.").max(365, "Use 365 days or fewer.").default(DEFAULT_CUTOFF_DAYS),
  })
  .superRefine((q, ctx) => {
    const total = q.lines.reduce((s, l) => s + l.amountPence, 0);
    if (total <= 0) ctx.addIssue({ code: "custom", message: "The quote total must be more than £0." });
    if (q.depositPence <= 0) ctx.addIssue({ code: "custom", message: "The deposit must be more than £0." });
    if (q.depositPence > total) ctx.addIssue({ code: "custom", message: "The deposit can't be more than the total." });
  });

/** Suggested starting lines for the owner's quote: base price plus the planner's chosen extras. */
export async function suggestedQuoteLines(db: Db, enquiry: EnquiryRow): Promise<QuoteLine[]> {
  const listing = (await getListing(db, enquiry.listing_id))!;
  const base = basePrice({ pricingModel: listing.pricing_model, pricePence: listing.price_pence }, enquiry.guests);
  return [
    { label: base.label, amountPence: base.pence ?? 0 },
    ...enquiry.selected_extras.map((x) => ({ label: x.label, amountPence: x.pricePence ?? 0 })),
  ];
}

export async function sendQuote(db: Db, actor: Actor | null, enquiryId: string, input: unknown): Promise<QuoteRow> {
  const { enquiry, listing, side } = await getEnquiryForParticipant(db, actor, enquiryId);
  if (side !== "owner") throw forbidden("Only the venue can send a quote.");
  if (["booked", "declined_by_venue", "declined_by_planner"].includes(enquiry.status)) throw conflict("This enquiry is closed.");
  const parsed = QuoteInputSchema.safeParse(input);
  if (!parsed.success) throw invalid(parsed.error.issues[0].message);
  const total = parsed.data.lines.reduce((s, l) => s + l.amountPence, 0);
  const [hold] = await db.query("select id from checkouts where enquiry_id = $1 and kind = 'deposit' and status = 'pending' and expires_at > now()", [enquiryId]);
  if (hold) throw conflict("The planner is paying the deposit on the current quote right now, so it can't be revised.");

  const quote = await db.transaction(async (tx) => {
    const [{ next }] = await tx.query<{ next: number }>("select coalesce(max(version), 0)::int + 1 as next from quotes where enquiry_id = $1", [enquiryId]);
    await tx.query("update quotes set status = 'superseded' where enquiry_id = $1 and status = 'active'", [enquiryId]);
    const [row] = await tx.query<QuoteRow>(
      `insert into quotes (enquiry_id, reference, version, lines, total_pence, deposit_pence, balance_due_days, cancellation_cutoff_days, cancellation_terms)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9) returning *`,
      [enquiryId, `Q-${enquiry.reference.replace("ENQ-", "")}-${next}`, next, JSON.stringify(parsed.data.lines), total, parsed.data.depositPence,
       parsed.data.balanceDueDays, parsed.data.cancellationCutoffDays, cancellationTerms(parsed.data.cancellationCutoffDays)],
    );
    await tx.query("update enquiries set status = 'quoted', first_reply_at = coalesce(first_reply_at, now()), updated_at = now() where id = $1", [enquiryId]);
    return row;
  });
  const [planner] = await db.query<{ email: string }>("select email from profiles where id = $1", [enquiry.planner_id]);
  await notify(db, {
    toEmail: planner.email, toRole: "planner", template: "quote_sent",
    subject: quote.version > 1 ? `Revised quote ${quote.reference} (${formatPounds(total)})` : `Your quote ${quote.reference} (${formatPounds(total)})`,
    path: `/enquiries/${enquiryId}`,
    heading: quote.version > 1 ? `${listing.name} revised your quote` : `${listing.name} sent you a quote`,
    reference: quote.reference,
    preheader: `Total ${formatPounds(total)}; pay the ${formatPounds(parsed.data.depositPence)} deposit in Gather to confirm.`,
    paragraphs: [
      quote.version > 1 ? "This version replaces the earlier quote, which can no longer be paid." : "Review the line items in Gather. Paying the deposit confirms the booking and blocks the date.",
    ],
    facts: [
      ["Quote total", formatPounds(total)],
      ["Deposit to confirm (paid in Gather)", formatPounds(parsed.data.depositPence)],
      ...(total > parsed.data.depositPence
        ? [[`Remaining balance (paid in Gather, due by ${longDate(balanceDueDate(enquiry.event_date, parsed.data.balanceDueDays))})`, formatPounds(total - parsed.data.depositPence)] as [string, string]]
        : []),
      ["Cancellation cutoff", `${parsed.data.cancellationCutoffDays} days before the event`],
    ],
    note: cancellationTerms(parsed.data.cancellationCutoffDays),
  });
  await track(db, "quote_sent", actor!.id, { enquiryId, version: quote.version });
  return quote;
}

export async function declineQuote(db: Db, actor: Actor | null, enquiryId: string, quoteId: string, reason: string) {
  const { enquiry, listing, side } = await getEnquiryForParticipant(db, actor, enquiryId);
  if (side !== "planner") throw forbidden("Only the planner can decline a quote.");
  const [quote] = await db.query<QuoteRow>("select * from quotes where id = $1 and enquiry_id = $2", [quoteId, enquiryId]);
  if (!quote || quote.status !== "active") throw conflict("Only the current quote can be declined.");
  await db.transaction(async (tx) => {
    await tx.query("update quotes set status = 'declined' where id = $1", [quoteId]);
    await tx.query("update enquiries set status = 'declined_by_planner', updated_at = now() where id = $1", [enquiryId]);
    const text = String(reason ?? "").trim();
    if (text) await tx.query("insert into messages (enquiry_id, author_id, body, quote_id) values ($1,$2,$3,$4)", [enquiryId, actor!.id, text, quoteId]);
  });
  const [owner] = await db.query<{ email: string }>("select email from profiles where id = $1", [listing.owner_id]);
  await notify(db, { toEmail: owner.email, toRole: "owner", template: "quote_declined", subject: `Quote ${quote.reference} was declined`, path: `/enquiries/${enquiry.id}` });
}

/** Strict caps are re-checked against the final quote before any payment. */
export function quoteExceedsCap(enquiry: EnquiryRow, quote: QuoteRow): number | null {
  if (enquiry.brief_snapshot.budget.mode !== "strict") return null;
  const cap = budgetTotalPence({ ...enquiry.brief_snapshot, guests: enquiry.guests });
  return cap !== null && quote.total_pence > cap ? cap : null;
}
