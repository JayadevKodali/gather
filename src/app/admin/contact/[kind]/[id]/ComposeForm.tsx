"use client";
import { useActionState } from "react";
import { InfoTip } from "@/components/InfoTip";
import { composeContactAction, type ComposeState } from "@/app/actions/admin";

export function ComposeForm({ kind, targetId, subject, body, recipient }: { kind: string; targetId: string; subject: string; body: string; recipient: string }) {
  const [state, action, pending] = useActionState<ComposeState, FormData>(composeContactAction, { errors: {}, subject, body });
  const e = state.errors;
  return (
    <form action={action} className="stack compose-mail" noValidate>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="targetId" value={targetId} />
      {e.form && <div className="notice error" role="alert">{e.form}</div>}
      <div className="mail-to"><span className="mail-key">To</span><span className="chip neutral pill">{recipient}</span><span className="tiny muted">The address comes from their Gather account.</span></div>
      <div className="field">
        <label htmlFor="subject">Subject</label>
        <input id="subject" name="subject" type="text" defaultValue={state.subject} maxLength={120} aria-invalid={!!e.subject} aria-describedby={e.subject ? "subject-error" : undefined} />
        {e.subject && <p className="field-error" id="subject-error">{e.subject}</p>}
      </div>
      <div className="field">
        <div className="label-row"><label htmlFor="body">Message</label><InfoTip id="body-hint">Blank lines start a new paragraph. The email adds a button to the right page in Gather.</InfoTip></div>
        <textarea id="body" name="body" rows={9} defaultValue={state.body} maxLength={2000} aria-invalid={!!e.body} aria-describedby={e.body ? "body-error body-hint" : "body-hint"} />
        {e.body && <p className="field-error" id="body-error">{e.body}</p>}
      </div>
      <div className="actions spread-row"><span className="tiny muted">Next you’ll see the email exactly as it will arrive, before anything is sent.</span><button className="btn" type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? "Preparing…" : "Review email"}</button></div>
    </form>
  );
}
