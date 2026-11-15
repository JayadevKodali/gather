/**
 * Small helpers shared by server actions.
 *
 * Pattern used everywhere: call a service; if it throws a ServiceError, send the person back to
 * the page with a plain-English message in the URL (?error=…). Works without JavaScript.
 */
import { redirect } from "next/navigation";
import { ServiceError } from "@/lib/services/errors";

export function withParam(path: string, key: string, value: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

export async function attempt<T>(fn: () => Promise<T>, errorPath: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.code === "unauthenticated") redirect("/login");
      redirect(withParam(errorPath, "error", error.message));
    }
    throw error;
  }
}

export const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** "£1,234.50" or "1234.5" → 123450 pence. Empty → null. */
export function poundsToPence(value: string): number | null {
  const cleaned = value.replace(/[£,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function intOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}
