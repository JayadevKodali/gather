import type { Metadata } from "next";
import { Notices } from "@/components/Notice";
import { SignUpForm } from "./SignUpForm";
import { AuthShell } from "@/components/AuthShell";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const preset = params.role === "owner" ? "owner" : "planner";
  return (
    <AuthShell photo="glasshouse">
      <section className="panel">
        <h1>Create an account</h1>
        <p className="muted">Free during the 30-day pilot. If a paid plan for venues follows, we’ll tell you the price before asking you to opt in.</p>
        <Notices params={params} />
        <SignUpForm preset={preset} />
      </section>
    </AuthShell>
  );
}
