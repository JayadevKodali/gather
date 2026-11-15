import type { Metadata } from "next";
import { verifyEmailAction } from "../actions/auth";
import { TokenForm } from "@/components/TokenForm";
import { AuthShell } from "@/components/AuthShell";

export const metadata: Metadata = { title: "Confirm your email" };

export default function VerifyEmailPage() {
  return (
    <AuthShell photo="glasshouse">
      <section className="panel">
        <h1>Confirm your email</h1>
        <p className="muted">One step left: confirm this is your address and you’ll be signed in to your new account.</p>
        <TokenForm action={verifyEmailAction} kind="verify" />
      </section>
    </AuthShell>
  );
}
