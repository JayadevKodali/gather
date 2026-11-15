/** Daily Vercel Cron target (vercel.json). See src/lib/services/keepalive.ts. */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { keepAlive } from "@/lib/services/keepalive";

export async function GET(request: Request) {
  const result = await keepAlive(request.headers.get("authorization"), process.env.CRON_SECRET, getDb);
  if (result.status === 200) console.log("[gather] keep-alive ok");
  else console.warn(`[gather] keep-alive refused: ${result.body.error}`);
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": "no-store, max-age=0" } });
}
