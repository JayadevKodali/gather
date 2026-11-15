/** Serves a venue photo through the server, so storage stays private and drafts stay owner-only. */
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ServiceError } from "@/lib/services/errors";
import { photoForViewing } from "@/lib/services/photos";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; size: string }> }) {
  const { id, size } = await params;
  try {
    const { data, isPublic } = await photoForViewing(await getDb(), await getActor(), id, Number(size));
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "image/webp",
        // A replaced photo gets a new id, so a live listing's file never changes under the same URL.
        "cache-control": isPublic ? "public, max-age=86400" : "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ServiceError) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
    throw error;
  }
}
