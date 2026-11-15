/**
 * The database boundary. Everything in Gather talks to Postgres through this tiny interface:
 *
 *   db.query(sql, params)      → rows
 *   db.transaction(async tx => …) → all-or-nothing
 *
 * Two implementations, same SQL:
 *   - PGlite: real Postgres compiled to WebAssembly, stored in .data/pglite (demo mode, tests)
 *   - postgres.js: a normal connection to Supabase Postgres (connected mode)
 *
 * Dates (Postgres `date`) always come back as 'YYYY-MM-DD' strings so London-local event
 * days never shift with time zones.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
  exec(sql: string): Promise<void>;
}

const DATE_OID = 1082;

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite({ dataDir, parsers: { [DATE_OID]: (value: string) => value } });
  await pg.waitReady;

  type Queryable = {
    query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
    exec: (sql: string) => Promise<unknown>;
  };
  const wrap = (q: Queryable, inTx: boolean): Db => ({
    async query<T>(sql: string, params: unknown[] = []) {
      return (await q.query<T>(sql, params)).rows;
    },
    async transaction<R>(fn: (tx: Db) => Promise<R>) {
      if (inTx) return fn(wrap(q, true)); // already inside one: join it
      return pg.transaction((tx) => fn(wrap(tx as unknown as Queryable, true)));
    },
    async exec(sql: string) {
      await q.exec(sql);
    },
  });
  return wrap(pg as unknown as Queryable, false);
}

export async function createPostgresDb(url: string, maxConnections = 5): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  const sql = postgres(url, {
    prepare: false, // required by Supabase's transaction pooler
    ssl: local || /sslmode=/.test(url) ? undefined : "require", // encrypted to Supabase; local test servers have no TLS
    max: maxConnections,
    onnotice: () => {}, // "already exists, skipping" notices from re-runnable migrations
    types: {
      date: { to: DATE_OID, from: [DATE_OID], serialize: (x: string) => x, parse: (x: string) => x },
      // Our code passes JSON as text (JSON.stringify) — the same for both drivers. Without this,
      // postgres.js would JSON-encode that text a second time and store a quoted string.
      json: {
        to: 3802,
        from: [114, 3802],
        serialize: (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)),
        parse: (x: string) => JSON.parse(x),
      },
    },
  });
  type Unsafe = { unsafe: (q: string, p?: unknown[]) => Promise<unknown> };
  const wrap = (q: Unsafe, inTx: boolean): Db => ({
    async query<T>(text: string, params: unknown[] = []) {
      return (await q.unsafe(text, params as never[])) as T[];
    },
    async transaction<R>(fn: (tx: Db) => Promise<R>) {
      if (inTx) return fn(wrap(q, true));
      return sql.begin((tx) => fn(wrap(tx as unknown as Unsafe, true))) as Promise<R>;
    },
    async exec(text: string) {
      await q.unsafe(text);
    },
  });
  return wrap(sql as unknown as Unsafe, false);
}

/** Apply every file in supabase/migrations that has not been applied yet, in name order. */
export async function migrate(db: Db): Promise<string[]> {
  await db.exec(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set(
    (await db.query<{ name: string }>("select name from schema_migrations")).map((row) => row.name),
  );
  const applied: string[] = [];
  const files = fs.readdirSync(path.join(process.cwd(), "supabase", "migrations"));
  for (const file of files.filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const text = fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", file), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(text);
      await tx.query("insert into schema_migrations (name) values ($1)", [file]);
    });
    applied.push(file);
  }
  return applied;
}

// One shared connection per server process. Kept on globalThis so Next's dev-mode hot
// reload doesn't open a second PGlite on the same folder.
const globalForDb = globalThis as unknown as { __gatherDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__gatherDb ??= (async () => {
    const cfg = config();
    const db =
      cfg.database.kind === "pglite"
        ? await createPgliteDb(path.resolve(cfg.database.dataDir))
        : await createPostgresDb(cfg.database.url, cfg.database.poolMax);
    if (cfg.mode === "demo") {
      // Demo mode sets itself up. In connected mode, run `npm run db:migrate` once instead,
      // so several serverless instances never race to change the schema.
      await migrate(db);
      // First run in demo mode: load the synthetic venues and demo accounts automatically.
      const { ensureDemoSeed } = await import("@/lib/seed");
      await ensureDemoSeed(db);
    }
    return db;
  })();
  return globalForDb.__gatherDb;
}
