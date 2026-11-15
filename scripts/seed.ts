/**
 * npm run seed
 *
 * demo mode (default): deletes the local demo database (.data/pglite) and rebuilds it with the
 *   synthetic venues, demo accounts and sample activity. Safe: it's only local test data.
 *
 * connected mode (GATHER_MODE=connected, DATABASE_URL=… , SEED_PASSWORD=…):
 *   applies migrations, then adds the synthetic accounts and venues if they aren't there.
 *   Never deletes anything. Reviewer accounts use SEED_PASSWORD (not the demo default).
 */
import fs from "node:fs";
import path from "node:path";
import { createPgliteDb, createPostgresDb, migrate } from "@/lib/db";
import { seedAccountsAndVenues, seedDemo } from "@/lib/seed";

async function main() {
  // Only needs the database, not the other services.
  if (process.env.GATHER_MODE !== "connected") {
    const dir = path.resolve(process.env.PGLITE_DIR || ".data/pglite");
    fs.rmSync(dir, { recursive: true, force: true });
    const db = await createPgliteDb(dir);
    console.log("Migrations:", (await migrate(db)).join(", "));
    await seedDemo(db);
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from listings");
    console.log(`Demo database rebuilt at ${dir} with ${n} synthetic venues and sample activity.`);
    return;
  }
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12) throw new Error("Set SEED_PASSWORD (12+ characters) for the reviewer accounts.");
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to your Supabase Postgres connection string.");
  const db = await createPostgresDb(process.env.DATABASE_URL);
  console.log("Migrations applied:", (await migrate(db)).join(", ") || "none (up to date)");
  await seedAccountsAndVenues(db, password);
  console.log("Synthetic accounts and venues are in place.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
