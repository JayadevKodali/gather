import { notFound } from "next/navigation";
import { ServiceError } from "./errors";

/**
 * For pages that load one record by id: a missing record, a malformed id, or someone else's record
 * all show the same "not found" page. That doesn't reveal whether the record exists, and avoids a
 * generic error screen. Any other error still surfaces.
 */
export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof ServiceError && (error.code === "not_found" || error.code === "forbidden")) notFound();
    throw error;
  }
}
