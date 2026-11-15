/**
 * Runs before each page request. It only passes the requested path to the app (x-gather-path),
 * so that a signed-out person who opens an email link can be sent back to that page after
 * signing in. No access decisions are made here: those stay in the pages and services.
 */
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-gather-path", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/|api/|favicon.ico).*)"],
};
