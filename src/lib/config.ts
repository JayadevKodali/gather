/**
 * One place that decides which adapters Gather uses.
 *
 * GATHER_MODE=demo (default)  → embedded Postgres (PGlite) on disk, demo payments,
 *                               email written to an outbox table, rules-based brief reader.
 *                               Needs no accounts or secrets. Clearly labelled in the UI.
 * GATHER_MODE=connected       → real services. Every required variable must be set or the
 *                               app refuses to start. Nothing silently falls back to demo.
 */

export type Mode = "demo" | "connected";
type Env = Record<string, string | undefined>;
export type OpenAiEffort = "none" | "low" | "medium" | "high";

/** Economical default that supports Structured Outputs on the Responses API. Override with OPENAI_MODEL. */
export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";

function openAiExtractor(env: Env): AppConfig["extractor"] {
  const effort = (env.OPENAI_REASONING_EFFORT || "low") as OpenAiEffort;
  if (!["none", "low", "medium", "high"].includes(effort)) {
    throw new Error("OPENAI_REASONING_EFFORT must be none, low, medium or high.");
  }
  return { kind: "openai", apiKey: env.OPENAI_API_KEY!, model: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL, effort };
}

export interface AppConfig {
  mode: Mode;
  appUrl: string;
  /**
   * Where emails load images (the logo) from. Always the public site: a preview sits behind Vercel sign-in,
   * so Gmail and other mail apps, which fetch images without it, would show a broken image.
   */
  assetUrl: string;
  database: { kind: "pglite"; dataDir: string } | { kind: "postgres"; url: string; poolMax: number };
  payments: { kind: "demo" } | { kind: "stripe"; secretKey: string; webhookSecret: string };
  email: { kind: "outbox"; from: string } | { kind: "resend"; apiKey: string; from: string };
  extractor: { kind: "rules" } | { kind: "openai"; apiKey: string; model: string; effort: OpenAiEffort };
  /** Check new passwords against Have I Been Pwned (k-anonymity). Off in demo mode (no network). */
  passwordBreachCheck: boolean;
  /** Where venue photo files go. Metadata always lives in Postgres (listing_photos). */
  photos:
    | { kind: "local"; dir: string }
    | { kind: "supabase"; url: string; serviceKey: string; bucket: string }
    | { kind: "unavailable"; reason: string };
}

/** Supabase Storage when its server-side credentials are set; otherwise local disk (demo) or "unavailable" (hosted). */
function photoStore(env: Env, mode: Mode): AppConfig["photos"] {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return { kind: "supabase", url: env.SUPABASE_URL.replace(/\/$/, ""), serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, bucket: env.SUPABASE_STORAGE_BUCKET || "venue-photos" };
  }
  if (mode === "demo" || !env.VERCEL) return { kind: "local", dir: env.PHOTO_DIR || ".data/photos" };
  return { kind: "unavailable", reason: "Photo storage isn't set up on this deployment (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)." };
}

function required(env: Env, names: string[]): void {
  const missing = names.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `GATHER_MODE=connected but these environment variables are missing: ${missing.join(", ")}. ` +
        `See .env.example and README.md. (Demo mode needs none of them.)`,
    );
  }
}

export function loadConfig(env: Env = process.env): AppConfig {
  const mode: Mode = env.GATHER_MODE === "connected" ? "connected" : "demo";
  // On Vercel, the production domain is known even if APP_URL isn't set. Email links and Stripe
  // redirects use this, so they always point at the hosted site, never localhost.
  const vercelUrl = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;
  // A Vercel preview links to itself (its branch URL), so emails and payment pages from a preview open that
  // preview, never the production site. Production uses APP_URL.
  const previewUrl = env.VERCEL_ENV === "preview" && env.VERCEL_BRANCH_URL ? `https://${env.VERCEL_BRANCH_URL}` : undefined;
  const appUrl = (previewUrl || env.APP_URL || (mode === "connected" ? vercelUrl : undefined) || "http://localhost:3000").replace(/\/$/, "");
  const assetUrl = (mode === "connected" ? env.APP_URL || vercelUrl || appUrl : appUrl).replace(/\/$/, "");

  if (mode === "demo") {
    return {
      mode,
      appUrl,
      assetUrl,
      database: { kind: "pglite", dataDir: env.PGLITE_DIR || ".data/pglite" },
      payments: { kind: "demo" },
      email: { kind: "outbox", from: "Gather (demo) <demo@gather.test>" },
      // Demo mode uses the rules reader unless you explicitly opt in with EXTRACTOR=openai and a key.
      extractor: env.EXTRACTOR === "openai" && env.OPENAI_API_KEY ? openAiExtractor(env) : { kind: "rules" },
      photos: photoStore(env, mode),
      passwordBreachCheck: false,
    };
  }

  // Connected mode: explicit about every service.
  required(env, ["DATABASE_URL"]);
  if (!env.APP_URL && !vercelUrl) required(env, ["APP_URL"]);
  if (env.VERCEL && appUrl.startsWith("http://localhost")) throw new Error("APP_URL points at localhost on Vercel. Set it to the hosted URL.");
  const extractorKind = env.EXTRACTOR === "rules" ? "rules" : "openai";
  if (extractorKind === "openai") required(env, ["OPENAI_API_KEY"]);
  required(env, ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY", "EMAIL_FROM"]);
  if (!env.STRIPE_SECRET_KEY!.startsWith("sk_test_")) {
    throw new Error("Gather v1 only runs Stripe in test mode. STRIPE_SECRET_KEY must start with sk_test_.");
  }

  return {
    mode,
    appUrl,
    assetUrl,
    database: { kind: "postgres", url: env.DATABASE_URL!, poolMax: Number(env.DATABASE_POOL_MAX) || 5 },
    payments: { kind: "stripe", secretKey: env.STRIPE_SECRET_KEY!, webhookSecret: env.STRIPE_WEBHOOK_SECRET! },
    email: { kind: "resend", apiKey: env.RESEND_API_KEY!, from: env.EMAIL_FROM! },
    extractor: extractorKind === "openai" ? openAiExtractor(env) : { kind: "rules" },
    photos: photoStore(env, mode),
    passwordBreachCheck: env.PASSWORD_BREACH_CHECK !== "off",
  };
}

let cached: AppConfig | undefined;
export function config(): AppConfig {
  cached ??= loadConfig();
  return cached;
}

/** Tests only: forget the cached config so a changed environment is re-read. */
export function resetConfigForTests() {
  cached = undefined;
}

export const isDemo = () => config().mode === "demo";
