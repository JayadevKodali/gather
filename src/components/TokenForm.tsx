"use client";
/**
 * Forms opened from an emailed link. The token is in the URL fragment (#token=…), which browsers never send to
 * a server, so it doesn't end up in request logs or Referer headers. It's read here and posted with the form.
 * Nothing happens until the person presses the button, so email scanners that pre-open links can't use it up.
 */
import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";
import type { TokenFormState } from "@/app/actions/auth";
import { PasswordField } from "./PasswordField";

const readToken = () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
const subscribe = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };

export function TokenForm({ action, kind }: { action: (prev: TokenFormState, form: FormData) => Promise<TokenFormState>; kind: "reset" | "verify" }) {
  const token = useSyncExternalStore(subscribe, readToken, () => "");
  const [state, formAction, pending] = useActionState(action, { error: null });
  const expired = state.error?.startsWith("This link has expired");
  const again = kind === "reset" ? "/forgot-password" : "/check-email";
  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <div className="notice error mb-0" role="alert">
          {state.error} {expired && <Link href={again}>{kind === "reset" ? "Request a new reset link" : "Send a new link"}</Link>}
        </div>
      )}
      {kind === "reset" && <PasswordField label="New password" />}
      <div className="actions">
        <button className="btn" type="submit" disabled={pending || !token} aria-busy={pending || undefined}>
          {pending ? (kind === "reset" ? "Saving…" : "Confirming…") : kind === "reset" ? "Set new password" : "Confirm my email"}
        </button>
      </div>
      {!token && <p className="small muted mb-0">Open this page from the link in your email.</p>}
    </form>
  );
}
