/**
 * Runs before `next build` on Vercel (package.json "vercel-build").
 *
 * - Refuses to build demo mode on Vercel: PGlite on serverless would give each instance its own
 *   throwaway database.
 * - In connected mode, checks every required variable first (the build fails with a clear message
 *   instead of deploying something half-configured), then applies migrations and makes sure the
 *   synthetic reviewer accounts, the 32 venues and the payment-testing room exist.
 *   Idempotent: never deletes or overwrites data, so it is safe on every deploy.
 *
 * Prints which variables are set, never their values.
 */
import { loadConfig } from "@/lib/config";
import { createPostgresDb, migrate } from "@/lib/db";
import { seedAccountsAndVenues } from "@/lib/seed";

async function main() {
  if (process.env.GATHER_MODE !== "connected") {
    if (process.env.VERCEL) throw new Error("Set GATHER_MODE=connected in Vercel. Demo mode can't run on serverless hosting.");
    console.log("predeploy: demo mode, nothing to do.");
    return;
  }
  const cfg = loadConfig(); // throws, naming any missing variable
  console.log(`predeploy: connected mode for ${cfg.appUrl}; reader ${cfg.extractor.kind === "openai" ? `OpenAI ${cfg.extractor.model}` : "rules"}; payments ${cfg.payments.kind}; email ${cfg.email.kind}.`);
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12) throw new Error("Set SEED_PASSWORD (12+ characters) for the reviewer accounts.");
  if (cfg.database.kind !== "postgres") throw new Error("Connected mode needs DATABASE_URL.");
  const db = await createPostgresDb(cfg.database.url);
  const applied = await migrate(db);
  console.log(`predeploy: migrations ${applied.length ? applied.join(", ") : "already up to date"}.`);
  await seedAccountsAndVenues(db, password);
  const [counts] = await db.query<{ venues: number; published: number; accounts: number }>(
    `select (select count(*)::int from listings where is_synthetic) as venues,
            (select count(*)::int from listings where is_published) as published,
            (select count(*)::int from profiles where is_synthetic) as accounts`,
  );
  console.log(`predeploy: ${counts.venues} synthetic listings (${counts.published} published), ${counts.accounts} synthetic accounts.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`predeploy failed: ${(error as Error).message}`);
    process.exit(1);
  });
