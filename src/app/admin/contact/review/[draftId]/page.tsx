import type { Metadata } from "next";
import Link from "next/link";
import { cancelContactAction, sendContactAction } from "@/app/actions/admin";
import { Notices } from "@/components/Notice";
import { renderNotification } from "@/lib/adapters/email";
import { requirePageRole } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { getContactDraft } from "@/lib/services/admin-contact";
import { orNotFound } from "@/lib/services/page-guard";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "Review email · Gather admin" };

export default async function ReviewContactPage({ params, searchParams }: PageProps<"/admin/contact/review/[draftId]">) {
  const actor = await requirePageRole("admin");
  const { draftId } = await params;
  const query = await searchParams;
  const db = await getDb();
  const { draft, target } = await orNotFound(getContactDraft(db, actor, draftId));
  const back = `/admin/contact/${draft.kind}/${draft.target_id}`;
  const cfg = config();
  const { html, text } = renderNotification({
    toEmail: target.recipient.email, toRole: target.recipient.role, template: "admin_contact", subject: draft.subject, path: target.path,
    heading: draft.subject, paragraphs: draft.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean), ctaLabel: "Open in Gather",
    note: "This message is from the Gather team.",
  }, cfg.appUrl, cfg.assetUrl);

  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <p className="back-link"><Link href={back}><span aria-hidden="true">←</span> Back to {target.title}</Link></p>
      <h1>Review email</h1>
      <ol className="compose-steps" aria-label="Steps"><li className="done">Write</li><li aria-current="step">Review</li><li>Send</li></ol>
      <Notices params={query} />
      {draft.status !== "draft" ? (
        <div className="panel"><p className="mb-0">This message has already been {draft.status === "cancelled" ? "discarded" : "sent"}. <Link href={back}>See the contact history</Link>.</p></div>
      ) : (
        <div className="panel stack">
          <dl className="balance-rows" style={{ maxWidth: "none" }}>
            <div><dt>To</dt><dd>{target.recipient.name} ({target.recipient.role === "owner" ? "venue owner" : "planner"})</dd></div>
            <div><dt>Subject</dt><dd>{draft.subject}</dd></div>
          </dl>
          <div>
            <h2 className="small" style={{ fontWeight: 600 }}>What they’ll receive</h2>
            {/* The real email, exactly as rendered for sending. Sandboxed: no scripts, no forms. */}
            <iframe className="email-frame" title={`Email preview: ${draft.subject}`} srcDoc={html} sandbox="" />
            <details className="mt-s">
              <summary className="small">Plain-text version (for email apps that don’t show images)</summary>
              <pre className="email-preview">{text}</pre>
            </details>
          </div>
          <div className="actions">
            <form action={sendContactAction}><input type="hidden" name="draftId" value={draft.id} /><SubmitButton pendingLabel="Sending…">Send email</SubmitButton></form>
            <Link className="btn secondary" href={`${back}?draft=${draft.id}`}>Edit</Link>
            <form action={cancelContactAction}><input type="hidden" name="draftId" value={draft.id} /><SubmitButton className="btn quiet" pendingLabel="Discarding…">Discard draft</SubmitButton></form>
          </div>
        </div>
      )}
    </div>
  );
}
