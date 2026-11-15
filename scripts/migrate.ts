/** npm run db:migrate — apply supabase/migrations to DATABASE_URL (connected) or the demo database. */
import path from "node:path";
import { createPgliteDb, createPostgresDb, migrate } from "@/lib/db";

async function main() {
  // Only needs the database: connected mode uses DATABASE_URL, demo mode the local PGlite folder.
  const connected = process.env.GATHER_MODE === "connected";
  if (connected && !process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to your Supabase Postgres connection string.");
  const db = connected ? await createPostgresDb(process.env.DATABASE_URL!) : await createPgliteDb(path.resolve(process.env.PGLITE_DIR || ".data/pglite"));
  const applied = await migrate(db);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Already up to date.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
