/**
 * Password rules for NEW and RESET passwords (sign-in accepts any existing password, so older accounts keep working).
 *
 *   - 12 to 128 characters, counted as characters (not bytes); spaces allowed, so passphrases work.
 *   - Not on the NCSC common-passwords list (case-insensitive).
 *   - Not in Have I Been Pwned's breached-password corpus, checked with its k-anonymity range API: only the first
 *     5 characters of the password's SHA-1 hash leave the server, never the password or the full hash.
 *     If that service doesn't answer in time, the local list still applies and the outcome is logged
 *     (without the password).
 */
import { createHash } from "node:crypto";
import { COMMON_PASSWORDS } from "./common-passwords";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
export const TOO_COMMON = "This password is too common. Choose another.";

export const passwordLength = (pw: string) => Array.from(pw).length;

export function lengthProblem(pw: string): string | null {
  const n = passwordLength(pw);
  if (n < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters. A few words with spaces works well.`;
  if (n > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  return null;
}

export const isCommonPassword = (pw: string) => COMMON_PASSWORDS.has(pw.toLowerCase());

export type BreachCheck = (pw: string) => Promise<boolean | null>;

/** Have I Been Pwned range API (k-anonymity). Returns true if breached, false if not, null if unknown. */
export function hibpBreachCheck(fetchImpl: typeof fetch = fetch, timeoutMs = 2500): BreachCheck {
  return async (pw) => {
    const sha1 = createHash("sha1").update(pw, "utf8").digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5), suffix = sha1.slice(5);
    try {
      const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { "Add-Padding": "true", "user-agent": "Gather-password-check" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const body = await res.text();
      return body.split("\n").some((line) => {
        const [hash, count] = line.trim().split(":");
        return hash === suffix && Number(count) > 0; // padding rows have a count of 0
      });
    } catch {
      return null;
    }
  };
}

/** The local list never needs the network; demo mode and tests use only this. */
export const noBreachCheck: BreachCheck = async () => false;

/** Returns a message for the form, or null if the password is acceptable. */
export async function newPasswordProblem(pw: string, breached: BreachCheck): Promise<string | null> {
  const length = lengthProblem(pw);
  if (length) return length;
  if (isCommonPassword(pw)) return TOO_COMMON;
  const result = await breached(pw);
  if (result === true) return TOO_COMMON;
  if (result === null) console.warn("[gather] breached-password check unavailable; used the local list only");
  return null;
}
