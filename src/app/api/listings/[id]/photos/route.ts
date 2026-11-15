/**
 * Owner photo uploads (a plain multipart form post, so it works without JavaScript).
 * A Route Handler rather than a Server Action because photos are bigger than the Server Action body limit.
 * Vercel caps a request body at 4.5 MB, so the form sends at most 4 MB of files per upload.
 */
import { NextResponse } from "next/server";
import { withParam } from "@/lib/actions-util";
import { getActor } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { ServiceError } from "@/lib/services/errors";
import { addPhotos } from "@/lib/services/photos";
import { isSetupStep } from "@/lib/listing-setup";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let back = `/owner/listings/${id}`;
  const go = (key: "ok" | "error", message: string) =>
    NextResponse.redirect(new URL(`${withParam(back, key, message)}#photos`, request.url), 303);

  // Same-origin form posts only (the session cookie is SameSite=Lax as well).
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && origin !== config().appUrl) return new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 4.4 * 1024 * 1024) return go("error", "That upload is over 4 MB in total. Upload fewer or smaller photos at a time.");

  let form: FormData;
  try { form = await request.formData(); } catch { return go("error", "The upload didn't arrive in one piece. Please try again."); }
  // On a setup step (Phase 4), come back to the same step.
  const step = String(form.get("step") ?? "");
  if (isSetupStep(step)) back = withParam(back, "step", step);
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const replace = String(form.get("replace") ?? "") || null;
  try {
    const bytes = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: Buffer.from(await f.arrayBuffer()) })));
    const n = await addPhotos(await getDb(), await getActor(), id, bytes, replace);
    return go("ok", replace ? "Photo replaced." : n === 1 ? "Photo added." : `${n} photos added.`);
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.code === "unauthenticated") return NextResponse.redirect(new URL("/login", request.url), 303);
      if (error.code === "forbidden" || error.code === "not_found") return new Response("Not found", { status: 404 });
      return go("error", error.message);
    }
    console.error("[gather] photo upload failed", (error as Error).message);
    return go("error", "The photo couldn't be stored. Please try again in a moment.");
  }
}
