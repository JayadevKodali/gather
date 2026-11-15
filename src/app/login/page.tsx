import type { Metadata } from "next";
import Link from "next/link";
import { Notices } from "@/components/Notice";
import { safeNext } from "@/lib/auth/session";
import { isDemo } from "@/lib/config";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/seed";
import { demoSignInAction, signInAction } from "../actions/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { AuthShell } from "@/components/AuthShell";

export const metadata: Metadata = { title: "Sign in" };

const DEMO_DESCRIPTIONS: Record<string, string> = {
  "planner@gather.test": "Planner with no history — best for the main walkthrough",
  "owner@gather.test": "Owns The Loom Room and seven other listings",
  "admin@gather.test": "Amara's pilot dashboard",
  "maya@gather.test": "Planner with a confirmed booking and a pending enquiry",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const demo = isDemo();
  const next = typeof params.next === "string" && safeNext(params.next) ? params.next : "";
  return (
    <AuthShell photo="dusk" wide>
      <section className="panel">
        <h1>Sign in</h1>
        <Notices params={params} />
        {next && <p className="notice info">Sign in to continue to that page.</p>}
        <form action={signInAction}>
          <input type="hidden" name="next" value={next} />
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
          <div className="field">
            <div className="label-row spread-row"><label htmlFor="password">Password</label><Link href="/forgot-password" className="small">Forgot password?</Link></div>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <div className="actions"><SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton><Link href="/signup">New here? Create an account</Link></div>
        </form>
      </section>
      {demo && (
        <section className="panel" id="demo" aria-labelledby="demo-title">
          <h2 id="demo-title">Demo accounts</h2>
          <p className="muted small">Synthetic accounts for reviewers. Shortcuts exist only in demo mode. Password for all: <code>{DEMO_PASSWORD}</code></p>
          <div className="stack">
            {DEMO_ACCOUNTS.filter((a) => DEMO_DESCRIPTIONS[a.email]).map((a) => (
              <form key={a.email} action={demoSignInAction} className="spread">
                <input type="hidden" name="email" value={a.email} />
                <input type="hidden" name="next" value={next} />
                <span><strong>{a.fullName}</strong> <span className="tiny">({a.role === "owner" ? "venue owner" : a.role})</span><br /><span className="small muted">{DEMO_DESCRIPTIONS[a.email]}</span></span>
                <SubmitButton className="btn secondary small" pendingLabel="Signing in…">Sign in as {a.fullName.split(" ")[0]}</SubmitButton>
              </form>
            ))}
          </div>
        </section>
      )}
    </AuthShell>
  );
}
