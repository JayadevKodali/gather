import type { Metadata } from "next";
import { resetPasswordAction } from "../actions/auth";
import { TokenForm } from "@/components/TokenForm";
import { AuthShell } from "@/components/AuthShell";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthShell photo="dusk">
      <section className="panel">
        <h1>Choose a new password</h1>
        <p className="muted">Changing it signs you out on every device. The link from your email works once.</p>
        <TokenForm action={resetPasswordAction} kind="reset" />
      </section>
    </AuthShell>
  );
}
