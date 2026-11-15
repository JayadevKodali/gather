import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import { keepAlive } from "@/lib/services/keepalive";

const SECRET = "test-secret-at-least-16-chars";
const fakeDb = () => {
  const query = vi.fn(async () => [{ "?column?": 1 }]);
  return { db: { query, transaction: vi.fn(), exec: vi.fn() } as unknown as Db, query };
};

describe("keep-alive cron guard", () => {
  it("refuses when CRON_SECRET is not configured, without touching the database", async () => {
    const { db, query } = fakeDb();
    expect(await keepAlive(`Bearer ${SECRET}`, undefined, async () => db)).toEqual({ status: 503, body: { ok: false, error: "not configured" } });
    expect(query).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong credential, without touching the database", async () => {
    const { db, query } = fakeDb();
    for (const header of [null, "", "Bearer wrong", SECRET, `Bearer ${SECRET}x`]) {
      expect((await keepAlive(header, SECRET, async () => db)).status).toBe(401);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("with the right credential runs one read-only query and returns minimal status", async () => {
    const { db, query } = fakeDb();
    expect(await keepAlive(`Bearer ${SECRET}`, SECRET, async () => db)).toEqual({ status: 200, body: { ok: true } });
    expect(query).toHaveBeenCalledTimes(1);
    expect(String((query.mock.calls[0] as unknown[])[0])).toMatch(/^select 1 from listings limit 1$/);
  });

  it("hides database errors", async () => {
    const broken = { query: async () => { throw new Error("password authentication failed for user postgres"); } } as unknown as Db;
    const r = await keepAlive(`Bearer ${SECRET}`, SECRET, async () => broken);
    expect(r).toEqual({ status: 503, body: { ok: false, error: "database unavailable" } });
  });
});
