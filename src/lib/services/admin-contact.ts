/**
 * Amara contacting someone from the admin dashboard's "Needs attention" lists.
 *
 *  - Admin only. The recipient is always worked out on the server from the item (an enquiry's venue owner,
 *    a draft listing's owner, an unmatched brief's planner); the browser never chooses an address.
 *  - Compose → review → send. The draft is stored first, so the review step shows exactly what will go out.
 *  - Every send is kept in admin_contacts as the audit trail, linked to its email_outbox row.
 *  - Dedupe: one contact per item per 24 hours, and a draft can only be sent once (double clicks are safe).
 *  - Private planner/owner messages are never shown here or copied into the email.
 */
import type { Db } from "@/lib/db";
import { notify } from "@/lib/adapters/email";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/domain";
import { dateTime, longDate } from "@/lib/format";
import { conflict, forbidden, notFound, requireRole, type Actor } from "./errors";

export const CONTACT_KINDS = ["enquiry_waiting", "draft_listing", "unmatched_brief"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];
export const isContactKind = (k: string): k is ContactKind => (CONTACT_KINDS as readonly string[]).includes(k);

export const DEDUPE_HOURS = 24;
export const SUBJECT_MAX = 120;
export const BODY_MAX = 2000;

export interface ContactTarget {
  kind: ContactKind;
  targetId: string;
  title: string;
  facts: [string, string][];
  recipient: { id: string; name: string; email: string; role: "planner" | "owner" };
  /** Where the email's button takes the recipient (a page they can open). */
  path: string;
  defaultSubject: string;
  defaultBody: string;
}

export interface ContactRecord {
  id: string;
  status: string;
  subject: string;
  body: string;
  created_at: Date;
  sent_at: Date | null;
  admin_name: string;
  recipient_name: string;
  outbox_status: string | null;
}

const firstName = (full: string) => full.split(/\s+/)[0] ?? full;

export async function getContactTarget(db: Db, actor: Actor | null, kind: string, targetId: string): Promise<ContactTarget> {
  const admin = requireRole(actor, "admin");
  if (!isContactKind(kind)) throw notFound();
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) throw notFound();
  const sign = `\n\nThanks,\n${firstName(admin.fullName)}, Gather`;

  if (kind === "enquiry_waiting") {
    const [r] = await db.query<{ reference: string; listing_id: string; listing: string; owner_id: string; owner: string; owner_email: string; event_date: string; guests: number; created_at: Date; status: string; first_reply_at: Date | null }>(
      `select e.reference, l.id as listing_id, l.name as listing, p.id as owner_id, p.full_name as owner, p.email as owner_email,
              e.event_date::text as event_date, e.guests, e.created_at, e.status, e.first_reply_at
       from enquiries e join listings l on l.id = e.listing_id join profiles p on p.id = l.owner_id where e.id = $1`,
      [targetId],
    );
    if (!r) throw notFound();
    return {
      kind, targetId, title: `Enquiry ${r.reference} at ${r.listing}`,
      facts: [["Venue", r.listing], ["Event date", longDate(r.event_date)], ["Guests", String(r.guests)], ["Received", dateTime(r.created_at)], ["First reply", r.first_reply_at ? dateTime(r.first_reply_at) : "Not yet"]],
      recipient: { id: r.owner_id, name: r.owner, email: r.owner_email, role: "owner" },
      path: `/enquiries/${targetId}`,
      defaultSubject: `A planner is waiting on enquiry ${r.reference}`,
      defaultBody: `Hi ${firstName(r.owner)},\n\nA planner sent an enquiry for ${r.listing} on ${longDate(r.event_date)} (${r.guests} guests) and hasn't had a reply yet. Could you reply or send a quote in Gather? If the date doesn't work, declining it lets them move on quickly.${sign}`,
    };
  }

  if (kind === "draft_listing") {
    const [r] = await db.query<{ name: string; owner_id: string; owner: string; owner_email: string; updated_at: Date; is_published: boolean; area: string }>(
      `select l.name, p.id as owner_id, p.full_name as owner, p.email as owner_email, l.updated_at, l.is_published, l.borough as area
       from listings l join profiles p on p.id = l.owner_id where l.id = $1`,
      [targetId],
    );
    if (!r) throw notFound();
    return {
      kind, targetId, title: `Draft listing: ${r.name}`,
      facts: [["Venue", r.name], ["Area", r.area], ["Status", r.is_published ? "Live" : "Draft (not visible to planners)"], ["Last edited", dateTime(r.updated_at)]],
      recipient: { id: r.owner_id, name: r.owner, email: r.owner_email, role: "owner" },
      path: `/owner/listings/${targetId}`,
      defaultSubject: `Your Gather listing for ${r.name} is still a draft`,
      defaultBody: `Hi ${firstName(r.owner)},\n\nYour listing for ${r.name} is saved as a draft, so planners can't find it yet. Once it has at least one photo, capacities and a price, you can publish it from your Gather dashboard. Open the listing in Gather to finish it.${sign}`,
    };
  }

  const [r] = await db.query<{ planner_id: string; planner: string; planner_email: string; created_at: Date; event_type: string | null; area: string | null; guests: number | null; event_date: string | null }>(
    `select b.planner_id, p.full_name as planner, p.email as planner_email, b.created_at, b.confirmed->>'eventType' as event_type,
            b.confirmed->>'areaText' as area, (b.confirmed->>'guests')::int as guests, b.confirmed->>'date' as event_date
     from briefs b join profiles p on p.id = b.planner_id where b.id = $1`,
    [targetId],
  );
  if (!r) throw notFound();
  const what = `${r.event_type ? EVENT_TYPE_LABELS[r.event_type as EventType].toLowerCase() : "event"}${r.guests ? ` for ${r.guests}` : ""}${r.area ? ` near ${r.area}` : ""}`;
  return {
    kind, targetId, title: `Brief with no suitable venue: ${what}`,
    facts: [["Event", what], ["Date", r.event_date ? longDate(r.event_date) : "Not given"], ["Created", dateTime(r.created_at)]],
    recipient: { id: r.planner_id, name: r.planner, email: r.planner_email, role: "planner" },
    path: `/plan/${targetId}`,
    defaultSubject: "About your Gather search",
    defaultBody: `Hi ${firstName(r.planner)},\n\nNone of our venues fit your ${what} yet. Widening the area, date or budget in your brief may bring up options, and we're adding venues during the pilot. You can update your brief in Gather at any time.${sign}`,
  };
}

export async function contactHistory(db: Db, actor: Actor | null, kind: ContactKind, targetId: string): Promise<ContactRecord[]> {
  requireRole(actor, "admin");
  return db.query<ContactRecord>(
    `select c.id, c.status, c.subject, c.body, c.created_at, c.sent_at, a.full_name as admin_name, r.full_name as recipient_name, o.status as outbox_status
     from admin_contacts c join profiles a on a.id = c.admin_id join profiles r on r.id = c.recipient_id left join email_outbox o on o.id = c.outbox_id
     where c.kind = $1 and c.target_id = $2 and c.status in ('sent','logged','skipped','failed') order by c.created_at desc`,
    [kind, targetId],
  );
}

function validate(subject: string, body: string) {
  const s = subject.trim(); const b = body.trim();
  const errors: { subject?: string; body?: string } = {};
  if (s.length < 3) errors.subject = "Add a subject.";
  else if (s.length > SUBJECT_MAX) errors.subject = `Keep the subject under ${SUBJECT_MAX} characters.`;
  if (b.length < 10) errors.body = "Write a message of at least a sentence.";
  else if (b.length > BODY_MAX) errors.body = `Keep the message under ${BODY_MAX} characters.`;
  return { s, b, errors };
}

export async function recentSend(db: Db, kind: ContactKind, targetId: string) {
  const [r] = await db.query<{ sent_at: Date }>(
    `select sent_at from admin_contacts where kind = $1 and target_id = $2 and status in ('sent','logged','skipped')
     and sent_at > now() - make_interval(hours => $3) order by sent_at desc limit 1`,
    [kind, targetId, DEDUPE_HOURS],
  );
  return r?.sent_at ?? null;
}

export type DraftResult = { ok: true; draftId: string } | { ok: false; errors: { subject?: string; body?: string; form?: string } };

/** Step 1: store the draft. Returns field errors instead of throwing, so the form keeps what was typed. */
export async function createContactDraft(db: Db, actor: Actor | null, kind: string, targetId: string, subject: string, body: string): Promise<DraftResult> {
  const admin = requireRole(actor, "admin");
  const target = await getContactTarget(db, admin, kind, targetId);
  const { s, b, errors } = validate(subject, body);
  if (errors.subject || errors.body) return { ok: false, errors };
  const last = await recentSend(db, target.kind, targetId);
  if (last) return { ok: false, errors: { form: `${target.recipient.name} was already contacted about this on ${dateTime(last)}. You can contact them again after ${DEDUPE_HOURS} hours.` } };
  // A new draft replaces this admin's earlier unsent drafts for the same item (e.g. after "Edit").
  await db.query("update admin_contacts set status = 'cancelled' where admin_id = $1 and kind = $2 and target_id = $3 and status = 'draft'", [admin.id, target.kind, targetId]);
  const [row] = await db.query<{ id: string }>(
    `insert into admin_contacts (admin_id, kind, target_id, recipient_id, recipient_role, subject, body)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [admin.id, target.kind, targetId, target.recipient.id, target.recipient.role, s, b],
  );
  return { ok: true, draftId: row.id };
}

export async function getContactDraft(db: Db, actor: Actor | null, draftId: string) {
  requireRole(actor, "admin");
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) throw notFound();
  const [d] = await db.query<{ id: string; kind: ContactKind; target_id: string; subject: string; body: string; status: string }>(
    "select id, kind, target_id, subject, body, status from admin_contacts where id = $1", [draftId]);
  if (!d) throw notFound();
  const target = await getContactTarget(db, actor, d.kind, d.target_id); // recipient re-derived, never stored from the browser
  return { draft: d, target };
}

/** Step 2: send a reviewed draft, exactly once. */
export async function sendContactDraft(db: Db, actor: Actor | null, draftId: string) {
  const admin = requireRole(actor, "admin");
  const { draft, target } = await getContactDraft(db, admin, draftId);
  if (draft.status !== "draft") throw conflict("This message has already been sent or cancelled.");
  const last = await recentSend(db, draft.kind, draft.target_id);
  if (last) throw conflict(`${target.recipient.name} was already contacted about this on ${dateTime(last)}.`);
  // Claim the draft atomically so a double click or a second tab can't send it twice.
  const claimed = await db.query("update admin_contacts set status = 'sent', sent_at = now() where id = $1 and status = 'draft' returning id", [draftId]);
  if (claimed.length === 0) throw conflict("This message has already been sent or cancelled.");
  const { outboxId, status } = await notify(db, {
    toEmail: target.recipient.email, toRole: target.recipient.role, template: "admin_contact",
    subject: draft.subject, path: target.path,
    heading: draft.subject,
    preheader: draft.body.replace(/\s+/g, " ").slice(0, 90),
    paragraphs: draft.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    ctaLabel: "Open in Gather",
    note: "This message is from the Gather team.",
  });
  // sent = delivered to Resend; logged = demo outbox only; skipped = synthetic .test account; failed = provider error.
  const final = (["sent", "logged", "skipped", "failed"] as const).find((s) => s === status) ?? "failed";
  await db.query("update admin_contacts set status = $2, outbox_id = $3 where id = $1", [draftId, final, outboxId]);
  return { status: final, target };
}

export async function cancelContactDraft(db: Db, actor: Actor | null, draftId: string) {
  const admin = requireRole(actor, "admin");
  const rows = await db.query("update admin_contacts set status = 'cancelled' where id = $1 and status = 'draft' and admin_id = $2 returning id", [draftId, admin.id]);
  if (rows.length === 0) throw forbidden("Only an unsent draft can be cancelled.");
}

