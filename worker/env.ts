/**
 * The bindings the Worker uses (see wrangler.jsonc), typed as the minimal
 * shapes we call. Keeping them local means the Worker code also runs under
 * Node in tests, against tests/worker/fake-env.ts.
 */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1Like {
  prepare(query: string): D1Statement;
}

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Like;
  ASSETS: { fetch(request: Request): Promise<Response> };
  CREATE_LIMITER: RateLimiter;
  OPEN_LIMITER: RateLimiter;
  /** Keyed by share id, so guesses on one link are limited across all IPs. */
  SHARE_OPEN_LIMITER: RateLimiter;
}
