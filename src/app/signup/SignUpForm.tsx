"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signUpAction, type SignUpState } from "../actions/auth";
import { PasswordField } from "@/components/PasswordField";

/** Keeps what was typed (except the password) when the server refuses, e.g. a too-common password. */
export function SignUpForm({ preset }: { preset: "planner" | "owner" }) {
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUpAction, { error: null, fullName: "", email: "", role: preset });
  return (
    <form action={action} key={state.error ?? "new"}>
      {state.error && <div className="notice error" role="alert">{state.error}</div>}
      <fieldset>
        <legend>I’m signing up as</legend>
        <div className="choice-row">
          <label className="choice"><input type="radio" name="role" value="planner" defaultChecked={state.role === "planner"} /> An event planner</label>
          <label className="choice"><input type="radio" name="role" value="owner" defaultChecked={state.role === "owner"} /> A venue owner</label>
        </div>
      </fieldset>
      <div className="field"><label htmlFor="fullName">Your name</label><input id="fullName" name="fullName" type="text" autoComplete="name" required defaultValue={state.fullName} /></div>
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} /></div>
      <PasswordField />
      <p className="tiny">We’ll email you a link to confirm your address before your account opens. This is a test build: please use made-up details, not real personal data. Read how we use your information in our <Link href="/privacy">privacy notice</Link>.</p>
      <div className="actions">
        <button className="btn" type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? "Creating account…" : "Create account"}</button>
        <Link href="/login">I already have an account</Link>
      </div>
    </form>
  );
}
