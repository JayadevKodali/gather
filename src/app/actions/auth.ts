"use server";
import { redirect } from "next/navigation";
import { attempt, text, withParam } from "@/lib/actions-util";
import { forgetPendingVerification, pendingVerification, rememberPendingVerification } from "@/lib/auth/pending-verification";
import { clearSession, HOME_FOR_ROLE, safeNext, startSession } from "@/lib/auth/session";
import { isDemo } from "@/lib/config";
import { getDb } from "@/lib/db";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/seed";
import { requestPasswordReset, resendVerification, resetPassword, signIn, signUp, VerificationNeeded, verifyEmail } from "@/lib/services/accounts";
import { ServiceError } from "@/lib/services/errors";

export type SignUpState = { error: string | null; fullName: string; email: string; role: "planner" | "owner" };

export async function signUpAction(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const db = await getDb();
  const values = { fullName: text(form, "fullName"), email: text(form, "email"), role: (text(form, "role") === "owner" ? "owner" : "planner") as SignUpState["role"] };
  try {
    await signUp(db, { ...values, password: String(form.get("password") ?? "") });
  } catch (error) {
    if (error instanceof ServiceError) return { ...values, error: error.message };
    throw error;
  }
  await rememberPendingVerification(values.email, values.role);
  redirect("/check-email");
}

export async function signInAction(form: FormData) {
  const db = await getDb();
  const next = text(form, "next");
  const back = safeNext(next) ? `/login?next=${encodeURIComponent(next)}` : "/login";
  let actor;
  try {
    actor = await signIn(db, text(form, "email"), String(form.get("password") ?? ""));
  } catch (error) {
    // Only reached after the right password, so naming the address on the next page reveals nothing new.
    if (error instanceof VerificationNeeded) {
      await rememberPendingVerification(text(form, "email"), error.role);
      redirect("/check-email?unverified=1");
    }
    if (error instanceof ServiceError) redirect(withParam(back, "error", error.message));
    throw error;
  }
  await startSession(actor.id);
  redirect(safeNext(next) ? next : HOME_FOR_ROLE[actor.role]);
}

/** Demo mode only: one-click sign-in as a seeded synthetic account. Disabled in connected mode. */
export async function demoSignInAction(form: FormData) {
  if (!isDemo()) redirect("/login?error=Demo%20shortcuts%20are%20off%20in%20connected%20mode.");
  const email = text(form, "email");
  if (!DEMO_ACCOUNTS.some((a) => a.email === email)) redirect("/login?error=Unknown%20demo%20account.");
  const db = await getDb();
  const actor = await attempt(() => signIn(db, email, DEMO_PASSWORD), "/login");
  await startSession(actor.id);
  const next = text(form, "next");
  redirect(safeNext(next) ? next : HOME_FOR_ROLE[actor.role]);
}

export async function signOutAction() {
  await clearSession();
  redirect("/");
}

/** Forgot password: the same confirmation whether or not the address has an account. */
export async function forgotPasswordAction(form: FormData) {
  const db = await getDb();
  await requestPasswordReset(db, text(form, "email"));
  redirect("/forgot-password?sent=1");
}

export type TokenFormState = { error: string | null };

/** Reset form (useActionState): errors stay on the page so the link from the email can be used again. */
export async function resetPasswordAction(_prev: TokenFormState, form: FormData): Promise<TokenFormState> {
  const db = await getDb();
  try {
    await resetPassword(db, text(form, "token"), String(form.get("password") ?? ""));
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    throw error;
  }
  await clearSession();
  redirect(withParam("/login", "ok", "Your password has been changed and you've been signed out everywhere. Sign in with your new password."));
}

export async function verifyEmailAction(_prev: TokenFormState, form: FormData): Promise<TokenFormState> {
  const db = await getDb();
  let actor;
  try {
    actor = await verifyEmail(db, text(form, "token"));
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    throw error;
  }
  await forgetPendingVerification();
  await startSession(actor.id);
  redirect(withParam(HOME_FOR_ROLE[actor.role], "ok", `Email confirmed. Welcome to Gather, ${actor.fullName.split(" ")[0]}.`));
}

/**
 * Resend verification: rate-limited, and the same answer whether or not the address needs verifying.
 * Uses the address typed into the fallback field, or else the one remembered from sign-up or sign-in.
 */
export async function resendVerificationAction(form: FormData) {
  const db = await getDb();
  const typed = text(form, "email");
  const email = typed || (await pendingVerification())?.email;
  if (!email) redirect("/check-email");
  await resendVerification(db, email);
  if (typed) await rememberPendingVerification(typed);
  redirect("/check-email?resent=1");
}
