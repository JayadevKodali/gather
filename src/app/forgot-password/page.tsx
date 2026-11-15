import type { Metadata } from "next";
import Link from "next/link";
import { forgotPasswordAction } from "../actions/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { RESET_MINUTES } from "@/lib/services/accounts";
import { AuthShell } from "@/components/AuthShell";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const params = await searchParams;
  return (
    <AuthShell photo="dusk">
      <section className="panel">
        <h1>Reset your password</h1>
        {params.sent ? (
          <>
            <p className="notice ok" role="status">If there’s a Gather account for that email, we’ve sent a link to reset its password. It works once and expires in {RESET_MINUTES} minutes.</p>
            <p className="small muted">Nothing arrived after a few minutes? Check your spam folder, or <Link href="/forgot-password">try again</Link>.</p>
            <Link className="btn secondary" href="/login">Back to sign in</Link>
          </>
        ) : (
          <form action={forgotPasswordAction}>
            <p className="muted">Enter the email you use for Gather and we’ll send you a link to choose a new password.</p>
            <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
            <div className="actions"><SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton><Link href="/login">Back to sign in</Link></div>
          </form>
        )}
      </section>
    </AuthShell>
  );
}
