/**
 * Who is signed in, for pages and server actions.
 * The role always comes from the database row for the session — never from the browser.
 */
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { actorFromSession, createSession, endSession, SESSION_DAYS } from "@/lib/services/accounts";
import type { Actor, Role } from "@/lib/services/errors";

export const SESSION_COOKIE = "gather_session";

/** The signed-in person for this request, or null. Cached per request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return actorFromSession(await getDb(), token);
});

export const HOME_FOR_ROLE: Record<Role, string> = { planner: "/plan", owner: "/owner", admin: "/admin" };

/** Use at the top of a page: sends signed-out people to sign in, and wrong roles to their own home. */
export async function requirePageRole(...roles: Role[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    // Come back here after signing in (e.g. from an email link to an enquiry).
    const path = (await headers()).get("x-gather-path");
    redirect(path && safeNext(path) ? `/login?next=${encodeURIComponent(path)}` : "/login");
  }
  if (!roles.includes(actor.role)) redirect(`${HOME_FOR_ROLE[actor.role]}?notice=${encodeURIComponent("That page is for a different account type.")}`);
  return actor;
}

export async function startSession(profileId: string) {
  const { token, expiresAt } = await createSession(await getDb(), profileId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function clearSession() {
  const store = await cookies();
  await endSession(await getDb(), store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
}

/** Only allow returning to a path on this site (no "//evil.example" or full URLs). */
export function safeNext(path: string | null | undefined): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") && path.length < 500;
}
