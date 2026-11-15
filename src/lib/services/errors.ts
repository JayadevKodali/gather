/** Errors the services throw. The UI turns them into plain messages. */
export type ServiceErrorCode = "unauthenticated" | "forbidden" | "not_found" | "invalid" | "conflict";

export class ServiceError extends Error {
  constructor(public code: ServiceErrorCode, message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

export const forbidden = (message = "You don't have access to that.") => new ServiceError("forbidden", message);
export const notFound = (message = "We couldn't find that.") => new ServiceError("not_found", message);
export const invalid = (message: string) => new ServiceError("invalid", message);
export const conflict = (message: string) => new ServiceError("conflict", message);

export type Role = "planner" | "owner" | "admin";

/** The signed-in person, as the server sees them. The role comes from the database, never the browser. */
export interface Actor {
  id: string;
  role: Role;
  email: string;
  fullName: string;
}

export function requireRole(actor: Actor | null, ...roles: Role[]): Actor {
  if (!actor) throw new ServiceError("unauthenticated", "Please sign in.");
  if (!roles.includes(actor.role)) throw forbidden(`This page is for ${roles.join(" or ")} accounts.`);
  return actor;
}

/** Postgres unique-constraint violation (code 23505). */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return e?.code === "23505" || /duplicate key value/.test(e?.message ?? "");
}

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I/L
export function shortCode(length = 4): string {
  let out = "";
  for (let i = 0; i < length; i++) out += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  return out;
}
