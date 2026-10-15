import { beforeAll, describe, expect, it } from "vitest";
import { type SealedShare, sealShare } from "../../src/lib/share/crypto";
import { SHARE_MAX_CIPHERTEXT_BYTES, toBase64 } from "../../src/shared/share-protocol";
import type { Env } from "../../worker/env";
import worker from "../../worker/index";
import { handleApi, newShareId, purgeExpired, rateLimitKey } from "../../worker/shares";
import { createLimiter, createTestEnv } from "./fake-env";

const ORIGIN = "https://readme.test";
const NOW = Date.UTC(2026, 9, 15);
const DAY = 86_400_000;
let sealed: SealedShare;

beforeAll(async () => {
  sealed = await sealShare(
    { v: 1, markdown: "# Secret plan", title: "Secret plan", base: null },
    "correct horse",
    100_000,
  );
});

function post(path: string, body: unknown, ip = "203.0.113.7") {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const get = (path: string) => new Request(`${ORIGIN}${path}`);

async function create(
  env: Env,
  overrides: Record<string, unknown> = {},
  options: { now?: number; ip?: string; newId?: () => string; storageCapBytes?: number } = {},
) {
  const res = await handleApi(
    post("/api/shares", { ...sealed, ttlDays: 7, ...overrides }, options.ip),
    env,
    { now: options.now ?? NOW, newId: options.newId, storageCapBytes: options.storageCapBytes },
  );
  return { res, body: (await res.json()) as Record<string, unknown> };
}

describe("share API", () => {
  it("creates a share and stores ciphertext only", async () => {
    const { env, db } = createTestEnv();
    const { res, body } = await create(env);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body.id).toMatch(/^[0-9A-Za-z]{10}$/);
    expect(body.expiresAt).toBe(NOW + 7 * DAY);
    const row = JSON.stringify(db.sqlite.prepare("SELECT * FROM shares").get());
    expect(row).not.toContain("Secret plan");
    expect(row).not.toContain(sealed.auth);
    expect(row).toMatch(/"auth_hash":"[0-9a-f]{64}"/);
  });

  it("returns the salt, then the ciphertext for the right proof", async () => {
    const { env } = createTestEnv();
    const { body } = await create(env);
    const meta = await handleApi(get(`/api/shares/${body.id}`), env, { now: NOW });
    expect(meta.status).toBe(200);
    expect(await meta.json()).toEqual({
      salt: sealed.salt,
      iterations: 100_000,
      expiresAt: NOW + 7 * DAY,
    });
    const open = await handleApi(post(`/api/shares/${body.id}/open`, { auth: sealed.auth }), env, {
      now: NOW,
    });
    expect(open.status).toBe(200);
    expect(await open.json()).toEqual({ ciphertext: sealed.ciphertext, iv: sealed.iv });
  });

  it("refuses a wrong password proof", async () => {
    const { env } = createTestEnv();
    const { body } = await create(env);
    const wrong = toBase64(new Uint8Array(32));
    const res = await handleApi(post(`/api/shares/${body.id}/open`, { auth: wrong }), env, {
      now: NOW,
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Wrong password." });
  });

  it("answers 404 for unknown links and 410 for expired ones", async () => {
    const { env } = createTestEnv();
    const missing = await handleApi(get("/api/shares/AAAAAAAAAA"), env, { now: NOW });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "This link doesn't exist." });

    const { body } = await create(env, { ttlDays: 1 });
    const later = NOW + DAY + 1;
    const meta = await handleApi(get(`/api/shares/${body.id}`), env, { now: later });
    expect(meta.status).toBe(410);
    expect(await meta.json()).toEqual({ error: "This link has expired." });
    const open = await handleApi(post(`/api/shares/${body.id}/open`, { auth: sealed.auth }), env, {
      now: later,
    });
    expect(open.status).toBe(410);
  });

  it("rejects malformed requests", async () => {
    const { env } = createTestEnv();
    for (const overrides of [
      { ttlDays: 365 },
      { ttlDays: undefined },
      { iterations: 1_000 },
      { iterations: 100_000.5 },
      { iv: toBase64(new Uint8Array(8)) },
      { salt: toBase64(new Uint8Array(4)) },
      { auth: toBase64(new Uint8Array(16)) },
      { ciphertext: "!!!" },
      { ciphertext: toBase64(new Uint8Array(16)) },
    ]) {
      const { res } = await create(env, overrides);
      expect(res.status, JSON.stringify(overrides)).toBe(400);
    }
    for (const raw of ["{", "[]", "null"]) {
      const res = await handleApi(post("/api/shares", raw), env, { now: NOW });
      expect(res.status, raw).toBe(400);
    }
  });

  it("rejects documents over the size cap", async () => {
    const { env } = createTestEnv();
    const { res } = await create(env, {
      ciphertext: toBase64(new Uint8Array(SHARE_MAX_CIPHERTEXT_BYTES + 1)),
    });
    expect(res.status).toBe(413);
  });

  it("rate-limits creating and opening per IP", async () => {
    const { env } = createTestEnv({
      CREATE_LIMITER: createLimiter(1),
      OPEN_LIMITER: createLimiter(2),
    });
    const first = await create(env);
    expect(first.res.status).toBe(201);
    expect((await create(env)).res.status).toBe(429);
    expect((await create(env, {}, { ip: "198.51.100.9" })).res.status).toBe(201);

    const wrong = { auth: toBase64(new Uint8Array(32)) };
    const path = `/api/shares/${first.body.id}/open`;
    expect((await handleApi(post(path, wrong), env, { now: NOW })).status).toBe(403);
    expect((await handleApi(post(path, wrong), env, { now: NOW })).status).toBe(403);
    const blocked = await handleApi(post(path, { auth: sealed.auth }), env, { now: NOW });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      error: "Too many attempts. Wait a minute and try again.",
    });
  });

  it("counts a whole IPv6 /64 as one client", async () => {
    const { env } = createTestEnv({ CREATE_LIMITER: createLimiter(1) });
    expect((await create(env, {}, { ip: "2001:db8::1" })).res.status).toBe(201);
    expect((await create(env, {}, { ip: "2001:db8:0:0:ffff::2" })).res.status).toBe(429);
    expect((await create(env, {}, { ip: "2001:db8:0:1::1" })).res.status).toBe(201);
  });

  it("limits attempts on one link across all IPs", async () => {
    const { env } = createTestEnv({ SHARE_OPEN_LIMITER: createLimiter(2) });
    const target = (await create(env)).body.id;
    const other = (await create(env)).body.id;
    const wrong = { auth: toBase64(new Uint8Array(32)) };
    const open = (id: unknown, body: unknown, ip: string) =>
      handleApi(post(`/api/shares/${id}/open`, body, ip), env, { now: NOW });
    expect((await open(target, wrong, "198.51.100.1")).status).toBe(403);
    expect((await open(target, wrong, "198.51.100.2")).status).toBe(403);
    const blocked = await open(target, { auth: sealed.auth }, "198.51.100.3");
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      error: "Too many attempts. Wait a minute and try again.",
    });
    expect((await open(other, { auth: sealed.auth }, "198.51.100.3")).status).toBe(200);
  });

  it("stops accepting shares once live storage reaches the cap", async () => {
    const { env } = createTestEnv();
    const cap = 2 * sealed.ciphertext.length;
    expect((await create(env, { ttlDays: 1 }, { storageCapBytes: cap })).res.status).toBe(201);
    expect((await create(env, { ttlDays: 1 }, { storageCapBytes: cap })).res.status).toBe(201);
    const full = await create(env, {}, { storageCapBytes: cap });
    expect(full.res.status).toBe(503);
    expect(full.body).toEqual({ error: "Sharing is temporarily unavailable. Try again later." });
    // Expired rows don't count, even before the daily purge removes them.
    const later = await create(env, {}, { storageCapBytes: cap, now: NOW + DAY + 1 });
    expect(later.res.status).toBe(201);
  });

  it("retries when a generated id is already taken", async () => {
    const { env } = createTestEnv();
    const ids = ["Taken00000", "Taken00000", "Fresh00000"];
    const newId = () => ids.shift() ?? newShareId();
    expect((await create(env, {}, { newId })).body.id).toBe("Taken00000");
    const second = await create(env, {}, { newId });
    expect(second.res.status).toBe(201);
    expect(second.body.id).toBe("Fresh00000");
  });

  it("answers unknown routes and wrong methods", async () => {
    const { env } = createTestEnv();
    expect((await handleApi(get("/api/shares"), env)).status).toBe(405);
    expect((await handleApi(get("/api/shares/AAAAAAAAAA/open"), env)).status).toBe(405);
    expect((await handleApi(get("/api/shares/bad"), env)).status).toBe(404);
    expect((await handleApi(get("/api/other"), env)).status).toBe(404);
  });

  it("purges only expired shares", async () => {
    const { env, db } = createTestEnv();
    await create(env, { ttlDays: 1 });
    await create(env, { ttlDays: 30 });
    expect(await purgeExpired(env.DB, NOW + 2 * DAY)).toBe(1);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM shares").get()).toEqual({ n: 1 });
  });

  it("generates unguessable 10-character base62 ids", () => {
    const ids = new Set(Array.from({ length: 1000 }, newShareId));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^[0-9A-Za-z]{10}$/);
  });
});

describe("rateLimitKey", () => {
  it("keeps IPv4 addresses as they are", () => {
    expect(rateLimitKey("203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitKey("unknown")).toBe("unknown");
  });

  it("keys IPv6 addresses on their /64, expanding :: first", () => {
    const key = rateLimitKey("2001:db8::1");
    expect(key).toBe("2001:db8:0:0::/64");
    for (const ip of [
      "2001:db8:0:0:ffff::2",
      "2001:0DB8:0000:0000:1:2:3:4",
      "2001:db8::",
      "2001:db8:0:0::ffff:192.0.2.1",
      "2001:db8::1%eth0",
    ]) {
      expect(rateLimitKey(ip), ip).toBe(key);
    }
    expect(rateLimitKey("2001:db8:0:1::1")).toBe("2001:db8:0:1::/64");
    expect(rateLimitKey("1::2:3:4:5:6:7")).toBe("1:0:2:3::/64");
    expect(rateLimitKey("::1")).toBe("0:0:0:0::/64");
    expect(rateLimitKey("::ffff:192.0.2.1")).toBe("0:0:0:0::/64");
  });

  it("leaves malformed IPv6 text unchanged", () => {
    for (const ip of ["1:2:3:4:5:6:7:8:9", "1::2::3", "1:2:3", "zz::1", "12345::1"]) {
      expect(rateLimitKey(ip), ip).toBe(ip);
    }
  });
});

describe("worker entry", () => {
  it("sends /api to the share API and everything else to the static assets", async () => {
    const { env } = createTestEnv();
    const page = await worker.fetch(get("/s/Ab3dE5gH9k"), env);
    expect(page.headers.get("x-from")).toBe("assets");
    const api = await worker.fetch(get("/api/shares/AAAAAAAAAA"), env);
    expect(api.status).toBe(404);
  });

  it("purges expired shares on the daily cron", async () => {
    const { env, db } = createTestEnv();
    await create(env, { ttlDays: 1 }, { now: Date.now() - 2 * DAY });
    const pending: Promise<unknown>[] = [];
    await worker.scheduled({}, env, { waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM shares").get()).toEqual({ n: 0 });
  });
});
