import type { Metadata } from "next";
import Link from "next/link";
import { resendVerificationAction } from "../actions/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { pendingVerification, type PendingRole } from "@/lib/auth/pending-verification";
import { isDemo } from "@/lib/config";
import { VERIFY_HOURS } from "@/lib/services/accounts";
import { AuthShell } from "@/components/AuthShell";

export const metadata: Metadata = { title: "Check your email" };

const NEXT_STEP: Record<PendingRole, string> = {
  planner: "Then describe your event and Gather will show you venues that fit.",
  owner: "Then add your venue, photos, prices and the dates you’re open.",
};

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </svg>
  );
}

export default async function CheckEmailPage({ searchParams }: PageProps<"/check-email">) {
  const params = await searchParams;
  // Set at sign-up, or at sign-in to an unconfirmed account. Missing in another browser: then we ask for the address.
  const pending = await pendingVerification();
  const account = pending?.role === "owner" ? "venue account" : pending?.role === "planner" ? "planner account" : "account";
  return (
    <AuthShell photo="glasshouse">
      <section className="panel">
        <h1>{params.unverified ? "Confirm your email first" : "Check your email"}</h1>
        {params.unverified && <p className="notice info">You need to confirm your email address before you can sign in.</p>}
        {params.resent && (
          <p className="notice ok" role="status">
            {pending ? "If this address is still waiting to be confirmed, we’ve sent it a new link." : "If that address has an account waiting to be confirmed, we’ve sent a new link."} You can ask again in a minute.
          </p>
        )}

        {pending ? (
          <>
            <p className="mb-0">We’ve sent a confirmation link to:</p>
            <p className="sent-to"><MailIcon /><span>{pending.email}</span></p>
            <p>
              Open it to finish setting up your {account}. {pending.role && NEXT_STEP[pending.role]} The link expires in {VERIFY_HOURS} hours.
            </p>
          </>
        ) : (
          !params.resent && <p>We’ve sent you a link to confirm your email address. Open it to finish setting up your account. It expires in {VERIFY_HOURS} hours.</p>
        )}
        {isDemo() && <p className="small muted">Demo mode: emails go to the <Link href="/dev/outbox">email outbox</Link> instead of a real inbox.</p>}

        <form action={resendVerificationAction} className="resend">
          <h2 className="small" style={{ fontWeight: 600 }}>Didn’t get it?</h2>
          {pending
            ? <p className="small muted">It can take a minute or two. Check your spam folder, then send a new link if you need one.</p>
            : <div className="field"><label htmlFor="email">Your email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>}
          <div className="actions"><SubmitButton className="btn secondary" pendingLabel="Sending…">Send a new link</SubmitButton><Link href="/login">Back to sign in</Link></div>
          {pending && <p className="small muted mt-s mb-0">Wrong address? <Link href={pending.role === "owner" ? "/signup?role=owner" : "/signup"}>Start again</Link> with the right one.</p>}
        </form>
      </section>
    </AuthShell>
  );
}
