"use server";
import { redirect } from "next/navigation";
import { attempt, text, withParam } from "@/lib/actions-util";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { resolveRefund } from "@/lib/services/booking-money";
import { cancelContactDraft, createContactDraft, getContactDraft, sendContactDraft } from "@/lib/services/admin-contact";
import { ServiceError } from "@/lib/services/errors";

export type ComposeState = { errors: { subject?: string; body?: string; form?: string }; subject: string; body: string };

/** Compose step (useActionState): keeps what Amara typed and shows errors next to the fields. */
export async function composeContactAction(_prev: ComposeState, form: FormData): Promise<ComposeState> {
  const kind = text(form, "kind");
  const targetId = text(form, "targetId");
  const subject = String(form.get("subject") ?? "");
  const body = String(form.get("body") ?? "");
  const db = await getDb();
  const actor = await getActor();
  let result;
  try {
    result = await createContactDraft(db, actor, kind, targetId, subject, body);
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.code === "unauthenticated") redirect("/login");
      return { errors: { form: error.message }, subject, body };
    }
    throw error;
  }
  if (!result.ok) return { errors: result.errors, subject, body };
  redirect(`/admin/contact/review/${result.draftId}`);
}

export async function sendContactAction(form: FormData) {
  const draftId = text(form, "draftId");
  const db = await getDb();
  const actor = await getActor();
  const review = `/admin/contact/review/${draftId}`;
  const { draft } = await attempt(() => getContactDraft(db, actor, draftId), "/admin");
  const back = `/admin/contact/${draft.kind}/${draft.target_id}`;
  const { status, target } = await attempt(() => sendContactDraft(db, actor, draftId), review);
  const message =
    status === "sent" ? `Email sent to ${target.recipient.name}. It's recorded below.`
    : status === "logged" ? `Recorded in the demo outbox for ${target.recipient.name}. Demo mode doesn't send email.`
    : status === "skipped" ? `Recorded, but not emailed: ${target.recipient.name} is a synthetic .test account.`
    : `The email to ${target.recipient.name} failed to send. It's recorded below; check the email provider.`;
  redirect(withParam(back, status === "failed" ? "error" : "ok", message));
}

export async function cancelContactAction(form: FormData) {
  const draftId = text(form, "draftId");
  const db = await getDb();
  const actor = await getActor();
  const { draft } = await attempt(() => getContactDraft(db, actor, draftId), "/admin");
  await attempt(() => cancelContactDraft(db, actor, draftId), `/admin/contact/review/${draftId}`);
  redirect(withParam(`/admin/contact/${draft.kind}/${draft.target_id}`, "notice", "Draft discarded. Nothing was sent."));
}

/** Admin: retry a failed refund, or decide a cancellation under review. */
export async function resolveRefundAction(form: FormData) {
  const refundId = text(form, "refundId");
  const decision = text(form, "decision");
  if (!["retry", "refund", "keep"].includes(decision)) redirect("/admin");
  const db = await getDb();
  const actor = await getActor();
  await attempt(() => resolveRefund(db, actor, refundId, decision as "retry" | "refund" | "keep"), "/admin");
  const message = decision === "keep" ? "Recorded: the venue keeps the deposit." : decision === "refund" ? "Refund sent." : "Refund retried.";
  redirect(withParam("/admin", "ok", `${message} The status below shows the result.`));
}
