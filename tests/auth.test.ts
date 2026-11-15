import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { redactSecretLink } from "@/lib/adapters/email";
import { hashPassword } from "@/lib/auth/password";
import { hibpBreachCheck, newPasswordProblem, noBreachCheck, TOO_COMMON } from "@/lib/auth/policy";
import { createPgliteDb, migrate, type Db } from "@/lib/db";
import { seedAccountsAndVenues } from "@/lib/seed";
import {
  actorFromSession, createSession, EXPIRED_LINK, requestPasswordReset, resendVerification, resetPassword, signIn, signUp,
  TOO_MANY_ATTEMPTS, VerificationNeeded, verifyEmail, WRONG_CREDENTIALS,
} from "@/lib/services/accounts";

let db: Db;
const PW = "test-password-123";

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await seedAccountsAndVenues(db, PW);
});

/** The token from the newest email of a template to an address (demo outbox keeps the full link). */
async function tokenFrom(email: string, template: string) {
  const [m] = await db.query<{ link: string }>("select link from email_outbox where to_email = $1 and template = $2 order by created_at desc limit 1", [email, template]);
  return new URLSearchParams(m.link.split("#")[1]).get("token")!;
}
const emailCount = async (email: string, template: string) =>
  (await db.query<{ n: number }>("select count(*)::int as n from email_outbox where to_email = $1 and template = $2", [email, template]))[0].n;

describe("new-password rules", () => {
  it("needs 12+ characters, accepts long passphrases with spaces, caps at 128", async () => {
    expect(await newPasswordProblem("elevenchars", noBreachCheck)).toMatch(/at least 12/);
    expect(await newPasswordProblem("twelve chars", noBreachCheck)).toBeNull();
    const passphrase = "correct horse battery staple on a quiet Sunday morning in Hackney Wick ok"; // 74 characters
    expect(passphrase.length).toBeGreaterThan(64);
    expect(await newPasswordProblem(passphrase, noBreachCheck)).toBeNull();
    expect(await newPasswordProblem("x".repeat(129), noBreachCheck)).toMatch(/128/);
  });

  it("blocks NCSC common passwords, whatever the case", async () => {
    expect(await newPasswordProblem("1q2w3e4r5t6y", noBreachCheck)).toBe(TOO_COMMON);
    expect(await newPasswordProblem("Q1W2E3R4T5Y6", noBreachCheck)).toBe(TOO_COMMON);
  });

  it("checks breaches with only a 5-character hash prefix, never the password", async () => {
    const pw = "a perfectly ordinary phrase";
    const sha1 = createHash("sha1").update(pw).digest("hex").toUpperCase();
    const fetchImpl = vi.fn(async (url: string) => new Response(`0000000000000000000000000000000000A:0\n${sha1.slice(5)}:42\n`, { status: 200 })) as unknown as typeof fetch;
    expect(await newPasswordProblem(pw, hibpBreachCheck(fetchImpl))).toBe(TOO_COMMON);
    const url = String((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]);
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
    expect(url).not.toContain(sha1.slice(5));
    expect(url).not.toContain(encodeURIComponent(pw));
    // Padding rows (count 0) don't count; if the service is down the local list still applies.
    const padded = (async () => new Response(`${sha1.slice(5)}:0\n`, { status: 200 })) as unknown as typeof fetch;
    expect(await newPasswordProblem(pw, hibpBreachCheck(padded))).toBeNull();
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await newPasswordProblem(pw, hibpBreachCheck(down))).toBeNull();
  });

  it("the email log keeps the page but not the secret token", () => {
    const link = "https://example.test/reset-password#token=SECRET123";
    expect(redactSecretLink(link, `Choose a new password: ${link}`)).toEqual({
      logLink: "https://example.test/reset-password#[link removed]",
      logText: "Choose a new password: https://example.test/reset-password#[link removed]",
    });
  });
});

describe("sign-in", () => {
  it("all three seeded reviewer accounts sign in (no inbox needed); older short passwords still work", async () => {
    for (const email of ["planner@gather.test", "owner@gather.test", "admin@gather.test"]) expect((await signIn(db, email, PW)).email).toBe(email);
    await db.query("insert into profiles (email, full_name, role, password_hash, email_verified_at) values ('old@x.test', 'Old User', 'planner', $1, now())", [await hashPassword("short123")]);
    expect((await signIn(db, "old@x.test", "short123")).fullName).toBe("Old User");
  });

  it("five failures trigger a cooldown (even for the right password); success clears the count", async () => {
    const email = "maya@gather.test";
    for (let i = 0; i < 4; i++) await expect(signIn(db, email, "wrong")).rejects.toThrow(WRONG_CREDENTIALS);
    expect((await signIn(db, email, PW)).email).toBe(email); // success resets
    for (let i = 0; i < 5; i++) await expect(signIn(db, email, "wrong")).rejects.toThrow(WRONG_CREDENTIALS);
    await expect(signIn(db, email, PW)).rejects.toThrow(TOO_MANY_ATTEMPTS);
    // Recovery: once the cooldown has passed, the right password works and the record is cleared.
    await db.query("update login_attempts set locked_until = now() - interval '1 second' where email = $1", [email]);
    expect((await signIn(db, email, PW)).email).toBe(email);
    expect(await db.query("select 1 from login_attempts where email = $1", [email])).toEqual([]);
  });

  it("an unknown email behaves exactly like a wrong password, cooldown included", async () => {
    for (let i = 0; i < 5; i++) await expect(signIn(db, "nobody@x.test", "whatever")).rejects.toThrow(WRONG_CREDENTIALS);
    await expect(signIn(db, "nobody@x.test", "whatever")).rejects.toThrow(TOO_MANY_ATTEMPTS);
  });
});

describe("sign-up needs a verified email", () => {
  it("both roles: no access until the link is used; links are single-use; resend is rate-limited", async () => {
    for (const role of ["planner", "owner"] as const) {
      const email = `new-${role}@x.test`;
      await signUp(db, { fullName: `New ${role}`, email, password: "a long enough passphrase", role }, noBreachCheck);
      await expect(signIn(db, email, "a long enough passphrase")).rejects.toBeInstanceOf(VerificationNeeded);
      const token = await tokenFrom(email, "verify_email");
      const actor = await verifyEmail(db, token);
      expect(actor.role).toBe(role);
      await expect(verifyEmail(db, token)).rejects.toThrow(EXPIRED_LINK); // reused
      expect((await signIn(db, email, "a long enough passphrase")).role).toBe(role);
    }
    await signUp(db, { fullName: "Slow Clicker", email: "slow@x.test", password: "a long enough passphrase", role: "planner" }, noBreachCheck);
    await resendVerification(db, "slow@x.test"); // within a minute of sign-up: nothing new
    expect(await emailCount("slow@x.test", "verify_email")).toBe(1);
    await db.query("update auth_tokens set created_at = now() - interval '2 minutes' where profile_id = (select id from profiles where email = 'slow@x.test')");
    await resendVerification(db, "slow@x.test");
    expect(await emailCount("slow@x.test", "verify_email")).toBe(2);
    await resendVerification(db, "nobody-here@x.test"); // unknown: silently nothing
    expect(await emailCount("nobody-here@x.test", "verify_email")).toBe(0);
  });

  it("refuses a common password at sign-up with the agreed message", async () => {
    await expect(signUp(db, { fullName: "Eve", email: "eve2@x.test", password: "1q2w3e4r5t6y", role: "planner" }, noBreachCheck)).rejects.toThrow(TOO_COMMON);
  });
});

describe("password reset", () => {
  it("same outcome for unknown addresses; single-use link; blocked passwords keep the link; sessions revoked", async () => {
    await requestPasswordReset(db, "no-such-person@x.test");
    expect(await emailCount("no-such-person@x.test", "password_reset")).toBe(0);

    const email = "owner2@gather.test";
    const [{ id }] = await db.query<{ id: string }>("select id from profiles where email = $1", [email]);
    const { token: session } = await createSession(db, id);
    await requestPasswordReset(db, email);
    const token = await tokenFrom(email, "password_reset");
    const [stored] = await db.query<{ token_hash: string }>("select token_hash from auth_tokens where profile_id = $1 and purpose = 'reset'", [id]);
    expect(stored.token_hash).not.toBe(token); // only the hash is stored
    expect(stored.token_hash).toBe(createHash("sha256").update(token).digest("hex"));

    await expect(resetPassword(db, token, "1q2w3e4r5t6y", noBreachCheck)).rejects.toThrow(TOO_COMMON);
    await resetPassword(db, token, "new garden party passphrase", noBreachCheck); // the link still worked
    expect(await actorFromSession(db, session)).toBeNull(); // signed out everywhere
    await expect(resetPassword(db, token, "another fine passphrase", noBreachCheck)).rejects.toThrow(EXPIRED_LINK); // reused
    await expect(signIn(db, email, PW)).rejects.toThrow(WRONG_CREDENTIALS);
    expect((await signIn(db, email, "new garden party passphrase")).email).toBe(email);
  });

  it("expired links are refused, and a reset ends any sign-in cooldown", async () => {
    const email = "owner3@gather.test";
    for (let i = 0; i < 5; i++) await expect(signIn(db, email, "wrong")).rejects.toThrow();
    await expect(signIn(db, email, PW)).rejects.toThrow(TOO_MANY_ATTEMPTS);
    await requestPasswordReset(db, email);
    const token = await tokenFrom(email, "password_reset");
    await db.query("update auth_tokens set expires_at = now() - interval '1 minute' where purpose = 'reset' and profile_id = (select id from profiles where email = $1)", [email]);
    await expect(resetPassword(db, token, "fresh evening passphrase", noBreachCheck)).rejects.toThrow(EXPIRED_LINK);
    await db.query("update auth_tokens set created_at = now() - interval '2 minutes' where profile_id = (select id from profiles where email = $1)", [email]);
    await requestPasswordReset(db, email);
    await resetPassword(db, await tokenFrom(email, "password_reset"), "fresh evening passphrase", noBreachCheck);
    expect((await signIn(db, email, "fresh evening passphrase")).email).toBe(email); // cooldown cleared
  });
});
