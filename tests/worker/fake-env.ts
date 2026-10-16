import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Like, D1Statement, Env, RateLimiter } from "../../worker/env";

const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(new URL(name, MIGRATIONS_DIR), "utf8"));

/** A D1 stand-in on Node's built-in SQLite, with the real migrations applied in order. */
export function createTestDb(): D1Like & { sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of MIGRATIONS) sqlite.exec(migration);
  const statement = (query: string, values: SQLInputValue[]): D1Statement => ({
    bind: (...next: unknown[]) => statement(query, next as SQLInputValue[]),
    first: async <T>() => (sqlite.prepare(query).get(...values) as T | undefined) ?? null,
    run: async () => ({ meta: { changes: Number(sqlite.prepare(query).run(...values).changes) } }),
  });
  return { sqlite, prepare: (query) => statement(query, []) };
}

/** Allows `limit` calls per key, then refuses, like the Workers rate-limiting binding. */
export function createLimiter(limit = Number.POSITIVE_INFINITY): RateLimiter {
  const counts = new Map<string, number>();
  return {
    limit: async ({ key }) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { success: count <= limit };
    },
  };
}

export function createTestEnv(overrides: Partial<Env> = {}) {
  const db = createTestDb();
  const env: Env = {
    DB: db,
    ASSETS: { fetch: async () => new Response("asset", { headers: { "x-from": "assets" } }) },
    CREATE_LIMITER: createLimiter(),
    OPEN_LIMITER: createLimiter(),
    SHARE_OPEN_LIMITER: createLimiter(),
    LOOKUP_LIMITER: createLimiter(),
    ...overrides,
  };
  return { env, db };
}
