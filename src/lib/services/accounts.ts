/**
 * Accounts, sessions, sign-in protection, password reset and email verification.
 *
 * - Public sign-up offers only "planner" and "owner". Admin accounts are created by the seed script.
 * - New accounts must verify their email before they can sign in. Accounts that existed before verification
 *   (including the seeded reviewer accounts) are already verified.
 * - Sessions, reset links and verification links are random tokens; only their SHA-256 hashes are stored,
 *   so a leaked database can't be used to sign in or reset a password.
 * - Repeated failed sign-ins for an email address (whether or not the account exists) trigger a short cooldown,
 *   tracked in the database so every server instance enforces it. Messages never reveal whether an account exists.
 */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { notify } from "@/lib/adapters/email";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hibpBreachCheck, newPasswordProblem, noBreachCheck, PASSWORD_MAX, type BreachCheck } from "@/lib/auth/policy";
import { config } from "@/lib/config";
import { track } from "./analytics";
import { invalid, isUniqueViolation, ServiceError, type Actor, type Role } from "./errors";

export const SESSION_DAYS = 14;
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MINUTES = 15;
export const COOLDOWN_MINUTES = 5;
export const RESET_MINUTES = 30;
export const VERIFY_HOURS = 24;
export const RESEND_GAP_SECONDS = 60;
export const MAX_EMAILS_PER_HOUR = 5;

export const WRONG_CREDENTIALS = "That email and password don't match an account.";
export const TOO_MANY_ATTEMPTS = "Too many attempts. Please wait a few minutes, then try again.";

export const SignUpSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  password: z.string().max(PASSWORD_MAX * 4), // the real length rules are in newPasswordProblem()
  role: z.enum(["planner", "owner"], { message: "Choose planner or venue owner" }),
});

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const normaliseEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();

export const breachCheck = (): BreachCheck => (config().passwordBreachCheck ? hibpBreachCheck() : noBreachCheck);

/** A sign-up or sign-in that needs the person to verify their email first (not an error page: a next step). */
export class VerificationNeeded extends ServiceError {
  /** The account's role, so "Check your email" can say what comes next for a planner or a venue owner. */
  readonly role: Role | null;
  constructor(message = "Check your email to verify your address before signing in.", role: Role | null = null) {
    super("invalid", message);
    this.role = role;
    this.name = "VerificationNeeded";
  }
}

// ---------- Sign-up and verification ----------

/** Creates an unverified account and emails a verification link. Returns nothing: no session yet. */
export async function signUp(db: Db, input: unknown, breached: BreachCheck = breachCheck()): Promise<{ profileId: string }> {
  const parsed = SignUpSchema.safeParse(input);
  if (!parsed.success) throw invalid(parsed.error.issues[0].message);
  const { fullName, email, password, role } = parsed.data;
  const problem = await newPasswordProblem(password, breached);
  if (problem) throw invalid(problem);
  let id: string;
  try {
    [{ id }] = await db.query<{ id: string }>(
      "insert into profiles (email, full_name, role, password_hash) values ($1, $2, $3, $4) returning id",
      [email, fullName, role, await hashPassword(password)],
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw invalid("An account with that email already exists. Try signing in, or reset your password.");
    throw error;
  }
  await track(db, "signup", id, { role });
  await sendVerification(db, id);
  return { profileId: id };
}

async function issueToken(db: Db, profileId: string, purpose: "reset" | "verify", ttlSql: string) {
  const token = newToken();
  await db.query(`insert into auth_tokens (token_hash, profile_id, purpose, expires_at) values ($1, $2, $3, now() + interval '${ttlSql}')`, [hashToken(token), profileId, purpose]);
  return token;
}

/** Rate limit for emails per account: one a minute, five an hour. */
async function canSendAnother(db: Db, profileId: string, purpose: "reset" | "verify") {
  const [r] = await db.query<{ recent: number; last_gap: number | null }>(
    `select count(*) filter (where created_at > now() - interval '1 hour')::int as recent,
            extract(epoch from (now() - max(created_at)))::float as last_gap
     from auth_tokens where profile_id = $1 and purpose = $2`,
    [profileId, purpose],
  );
  return r.recent < MAX_EMAILS_PER_HOUR && (r.last_gap === null || r.last_gap >= RESEND_GAP_SECONDS);
}

async function sendVerification(db: Db, profileId: string) {
  const [p] = await db.query<{ email: string; full_name: string; role: Role }>("select email, full_name, role from profiles where id = $1", [profileId]);
  const token = await issueToken(db, profileId, "verify", `${VERIFY_HOURS} hours`);
  await notify(db, {
    toEmail: p.email, toRole: p.role === "owner" ? "owner" : "planner", template: "verify_email",
    subject: "Confirm your email for Gather", heading: "Confirm your email",
    preheader: "One click to finish setting up your Gather account.",
    paragraphs: [`Hi ${p.full_name.split(" ")[0]}, confirm this is your email address to finish setting up your Gather account. The link works once and expires in ${VERIFY_HOURS} hours.`, "If you didn't create a Gather account, you can ignore this email."],
    ctaLabel: "Confirm my email", path: `/verify-email#token=${token}`, sensitiveLink: true,
  });
}

/** "Resend verification email": same answer whether or not the address has an unverified account. */
export async function resendVerification(db: Db, emailInput: string) {
  const email = normaliseEmail(emailInput);
  const [p] = await db.query<{ id: string; email_verified_at: Date | null }>("select id, email_verified_at from profiles where email = $1", [email]);
  if (p && !p.email_verified_at && (await canSendAnother(db, p.id, "verify"))) await sendVerification(db, p.id);
}

/** Confirms the email from a link. Single use; expired or used links are refused. Returns the person to sign in. */
export async function verifyEmail(db: Db, token: string): Promise<Actor> {
  const profileId = await consumeToken(db, token, "verify");
  await db.query("update profiles set email_verified_at = coalesce(email_verified_at, now()) where id = $1", [profileId]);
  const [p] = await db.query<{ id: string; email: string; full_name: string; role: Role }>("select id, email, full_name, role from profiles where id = $1", [profileId]);
  return { id: p.id, email: p.email, fullName: p.full_name, role: p.role };
}

export const EXPIRED_LINK = "This link has expired or has already been used. Request a new one.";

async function consumeToken(db: Db, token: string, purpose: "reset" | "verify"): Promise<string> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(String(token ?? ""))) throw invalid(EXPIRED_LINK);
  const [row] = await db.query<{ profile_id: string }>(
    "update auth_tokens set used_at = now() where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now() returning profile_id",
    [hashToken(token), purpose],
  );
  if (!row) throw invalid(EXPIRED_LINK);
  return row.profile_id;
}

/** Is a reset/verify link still usable? (For showing the right page, without using it up.) */
export async function tokenIsValid(db: Db, token: string, purpose: "reset" | "verify") {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(String(token ?? ""))) return false;
  const [row] = await db.query("select 1 from auth_tokens where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()", [hashToken(token), purpose]);
  return Boolean(row);
}

// ---------- Sign-in with cooldown ----------

/** If the address is in cooldown, refuse before checking anything else. */
async function assertNotCoolingDown(db: Db, email: string) {
  const [r] = await db.query<{ locked: boolean }>("select locked_until > now() as locked from login_attempts where email = $1", [email]);
  if (r?.locked) throw invalid(TOO_MANY_ATTEMPTS);
}

async function recordFailure(db: Db, email: string) {
  // One statement, so concurrent requests on different servers can't lose a count.
  await db.query(
    `insert into login_attempts (email, failures, window_start) values ($1, 1, now())
     on conflict (email) do update set
       failures = case when login_attempts.window_start < now() - interval '${FAILURE_WINDOW_MINUTES} minutes' then 1 else login_attempts.failures + 1 end,
       window_start = case when login_attempts.window_start < now() - interval '${FAILURE_WINDOW_MINUTES} minutes' then now() else login_attempts.window_start end,
       updated_at = now()`,
    [email],
  );
  await db.query(
    `update login_attempts set locked_until = now() + interval '${COOLDOWN_MINUTES} minutes', failures = 0, window_start = now()
     where email = $1 and failures >= $2`,
    [email, MAX_FAILURES],
  );
}

// Used when there's no account, so a wrong email takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;

export async function signIn(db: Db, emailInput: string, password: string): Promise<Actor> {
  const email = normaliseEmail(emailInput);
  await assertNotCoolingDown(db, email);
  const [row] = await db.query<{ id: string; email: string; full_name: string; role: Role; password_hash: string | null; email_verified_at: Date | null }>(
    "select id, email, full_name, role, password_hash, email_verified_at from profiles where email = $1",
    [email],
  );
  dummyHash ??= hashPassword(newToken());
  const ok = await verifyPassword(String(password ?? ""), row?.password_hash ?? (await dummyHash));
  if (!row || !ok) {
    await recordFailure(db, email);
    throw invalid(WRONG_CREDENTIALS);
  }
  await db.query("delete from login_attempts where email = $1", [email]); // success clears the count
  if (!row.email_verified_at) throw new VerificationNeeded(undefined, row.role);
  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role };
}

// ---------- Password reset ----------

/** "Forgot password?": always looks the same to the person asking, whether or not the address is registered. */
export async function requestPasswordReset(db: Db, emailInput: string) {
  const email = normaliseEmail(emailInput);
  const [p] = await db.query<{ id: string; full_name: string; role: Role; email: string }>("select id, full_name, role, email from profiles where email = $1", [email]);
  if (!p || !(await canSendAnother(db, p.id, "reset"))) return;
  const token = await issueToken(db, p.id, "reset", `${RESET_MINUTES} minutes`);
  await notify(db, {
    toEmail: p.email, toRole: p.role === "owner" ? "owner" : "planner", template: "password_reset",
    subject: "Reset your Gather password", heading: "Reset your password",
    preheader: `This link works once and expires in ${RESET_MINUTES} minutes.`,
    paragraphs: [`Someone asked to reset the password for your Gather account. If it was you, choose a new password with the button below. The link works once and expires in ${RESET_MINUTES} minutes.`, "If you didn't ask for this, you can ignore this email: your password won't change."],
    ctaLabel: "Choose a new password", path: `/reset-password#token=${token}`, sensitiveLink: true,
  });
}

/** Sets a new password from a reset link: single use, signs out every existing session, clears any cooldown. */
export async function resetPassword(db: Db, token: string, password: string, breached: BreachCheck = breachCheck()) {
  if (!(await tokenIsValid(db, token, "reset"))) throw invalid(EXPIRED_LINK);
  const problem = await newPasswordProblem(String(password ?? ""), breached);
  if (problem) throw invalid(problem); // the link stays usable so they can try another password
  const profileId = await consumeToken(db, token, "reset");
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    // Opening the link proves they control the inbox, so it also verifies the address.
    await tx.query("update profiles set password_hash = $2, email_verified_at = coalesce(email_verified_at, now()) where id = $1", [profileId, hash]);
    await tx.query("delete from sessions where profile_id = $1", [profileId]);
    await tx.query("update auth_tokens set used_at = coalesce(used_at, now()) where profile_id = $1 and purpose = 'reset'", [profileId]);
    await tx.query("delete from login_attempts where email = (select email from profiles where id = $1)", [profileId]);
  });
}

// ---------- Sessions ----------

export async function createSession(db: Db, profileId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.query("insert into sessions (token_hash, profile_id, expires_at) values ($1, $2, $3)", [hashToken(token), profileId, expiresAt]);
  return { token, expiresAt };
}

export async function actorFromSession(db: Db, token: string | undefined): Promise<Actor | null> {
  if (!token) return null;
  const [row] = await db.query<{ id: string; email: string; full_name: string; role: Role }>(
    `select p.id, p.email, p.full_name, p.role from sessions s join profiles p on p.id = s.profile_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  return row ? { id: row.id, email: row.email, fullName: row.full_name, role: row.role } : null;
}

export async function endSession(db: Db, token: string | undefined): Promise<void> {
  if (token) await db.query("delete from sessions where token_hash = $1", [hashToken(token)]);
}
