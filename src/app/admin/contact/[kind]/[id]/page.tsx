import type { Metadata } from "next";
import Link from "next/link";
import { Notices } from "@/components/Notice";
import { requirePageRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { contactHistory, DEDUPE_HOURS, getContactDraft, getContactTarget, recentSend } from "@/lib/services/admin-contact";
import { orNotFound } from "@/lib/services/page-guard";
import { ComposeForm } from "./ComposeForm";
import { StatusPill } from "@/components/StatusPill";

export const metadata: Metadata = { title: "Needs attention · Gather admin" };

const STATUS: Record<string, [string, string]> = {
  sent: ["green", "Sent"], logged: ["grey", "Recorded in demo outbox"], skipped: ["grey", "Recorded, not emailed (synthetic account)"], failed: ["red", "Failed to send"], cancelled: ["grey", "Discarded"],
};

export default async function AdminContactPage({ params, searchParams }: PageProps<"/admin/contact/[kind]/[id]">) {
  const actor = await requirePageRole("admin");
  const { kind, id } = await params;
  const query = await searchParams;
  const db = await getDb();
  const target = await orNotFound(getContactTarget(db, actor, kind, id));
  const history = await contactHistory(db, actor, target.kind, id);
  // "Edit" on the review step comes back here with the draft, so nothing typed is lost.
  const editing = typeof query.draft === "string" ? await getContactDraft(db, actor, query.draft).catch(() => null) : null;
  const draft = editing && editing.draft.status === "draft" && editing.draft.target_id === id ? editing.draft : null;
  const recentlySent = await recentSend(db, target.kind, id);

  return (
    <div className="wrap" style={{ maxWidth: 860 }}>
      <p className="back-link"><Link href="/admin"><span aria-hidden="true">←</span> Pilot dashboard</Link></p>
      <h1>{target.title}</h1>
      <ol className="compose-steps" aria-label="Steps"><li aria-current="step">Write</li><li>Review</li><li>Send</li></ol>
      <Notices params={query} />
      <div className="split">
        <section className="stack">
          <div className="panel">
            <h2>Details</h2>
            <dl className="balance-rows" style={{ maxWidth: "none" }}>
              {target.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              <div><dt>{target.recipient.role === "owner" ? "Venue owner" : "Planner"}</dt><dd>{target.recipient.name}</dd></div>
            </dl>
            <p className="tiny muted mb-0">Private messages between planners and venues aren’t shown here.</p>
          </div>
          <div className="panel">
            <h2>Contact {target.recipient.role === "owner" ? "the owner" : "the planner"}</h2>
            {recentlySent ? (
              <p className="mb-0">{target.recipient.name} was contacted about this on {dateTime(recentlySent)}. You can contact them again after {DEDUPE_HOURS} hours.</p>
            ) : (
              <ComposeForm kind={target.kind} targetId={id} subject={draft?.subject ?? target.defaultSubject} body={draft?.body ?? target.defaultBody} recipient={target.recipient.name} />
            )}
          </div>
        </section>
        <aside className="stack">
          <div className="panel">
            <h2>Contact history</h2>
            {history.length === 0 ? <p className="small muted mb-0">No one has been contacted about this yet.</p> : (
              <ol className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {history.map((h) => {
                  const [tone, label] = STATUS[h.status] ?? ["grey", h.status];
                  return (
                    <li key={h.id} className="small">
                      <StatusPill tone={tone as "grey"}>{label}</StatusPill>
                      <p className="mb-0 mt-s"><strong>{h.subject}</strong></p>
                      <p className="tiny muted mb-0">{h.admin_name} → {h.recipient_name}, {dateTime(h.sent_at ?? h.created_at)}</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
