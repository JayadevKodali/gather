/**
 * Remembers which address is waiting to be confirmed (and whether it's a planner or a venue owner), so
 * "Check your email" can say where the link went and what happens next, and "Send a new link" works with one
 * click. Email addresses never go in page addresses (they end up in browser history and server logs), so this
 * uses a short-lived cookie that only the server can read, sent only to /check-email, and cleared once the
 * address is confirmed. Strictly necessary; listed on /privacy.
 *
 * The cookie only changes wording on that page: the role in it is never used for access, and resending still
 * gives the same answer whatever address it holds.
 */
import { cookies } from "next/headers";
import { VERIFY_HOURS } from "@/lib/services/accounts";

export const PENDING_VERIFY_COOKIE = "gather_verify";
const COOKIE_PATH = "/check-email";

export type PendingRole = "planner" | "owner";
export type Pending = { email: string; role: PendingRole | null };

/** A plausible email address in lower case, or null. Anything else in the cookie is ignored. */
export function cleanPendingEmail(value: string | null | undefined): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return email.length > 0 && email.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) ? email : null;
}

/** Cookie value: "planner:<email>", "owner:<email>" or just "<email>". */
export function encodePending(email: string, role: string | null | undefined): string | null {
  const clean = cleanPendingEmail(email);
  if (!clean) return null;
  return role === "planner" || role === "owner" ? `${role}:${clean}` : clean;
}

export function decodePending(value: string | null | undefined): Pending | null {
  const raw = String(value ?? "");
  const m = /^(planner|owner):(.*)$/.exec(raw);
  const email = cleanPendingEmail(m ? m[2] : raw);
  return email ? { email, role: m ? (m[1] as PendingRole) : null } : null;
}

export async function rememberPendingVerification(email: string, role?: string | null) {
  const value = encodePending(email, role);
  if (!value) return;
  (await cookies()).set(PENDING_VERIFY_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: VERIFY_HOURS * 3600,
  });
}

export async function pendingVerification(): Promise<Pending | null> {
  return decodePending((await cookies()).get(PENDING_VERIFY_COOKIE)?.value);
}

export async function forgetPendingVerification() {
  (await cookies()).set(PENDING_VERIFY_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: COOKIE_PATH, maxAge: 0 });
}
