/**
 * Daily keep-alive for Supabase Free (which pauses projects after about a week of low activity).
 * Vercel Cron calls GET /api/cron/keepalive once a day with `Authorization: Bearer <CRON_SECRET>`.
 *
 * Read-only by design: one tiny SELECT on a non-sensitive table through the app's own pool.
 * No writes, emails, model calls or payment calls. The response never includes database details.
 * This is a safeguard, not a guarantee: Supabase can still pause a project, which is then resumed
 * from the Supabase dashboard (see docs/OPERATIONS.md).
 */
import { timingSafeEqual } from "node:crypto";
import type { Db } from "@/lib/db";

export type KeepAliveResult = { status: 200 | 401 | 503; body: { ok: boolean; error?: string } };

function secretMatches(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function keepAlive(authorization: string | null, secret: string | undefined, getDb: () => Promise<Db>): Promise<KeepAliveResult> {
  // A missing secret must never mean "open to everyone".
  if (!secret || secret.length < 16) return { status: 503, body: { ok: false, error: "not configured" } };
  if (!secretMatches(authorization, secret)) return { status: 401, body: { ok: false, error: "unauthorised" } };
  try {
    const db = await getDb();
    await db.query("select 1 from listings limit 1");
    return { status: 200, body: { ok: true } };
  } catch {
    return { status: 503, body: { ok: false, error: "database unavailable" } };
  }
}
