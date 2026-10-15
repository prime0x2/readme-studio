import {
  type CreateShareRequest,
  type CreateShareResponse,
  fromBase64,
  isShareTtlDays,
  type OpenShareResponse,
  SHARE_AUTH_BYTES,
  SHARE_ID_LENGTH,
  SHARE_IV_BYTES,
  SHARE_MAX_CIPHERTEXT_BYTES,
  SHARE_MAX_ITERATIONS,
  SHARE_MIN_ITERATIONS,
  SHARE_SALT_BYTES,
  type ShareErrorBody,
  type ShareMeta,
} from "../src/shared/share-protocol";
import type { D1Like, Env } from "./env";

/**
 * The share-link API. The server stores ciphertext and a hash of the access
 * proof; it can't read documents or passwords. Contract:
 * SPEC.md §10 (Share by Link).
 */

const DAY_MS = 86_400_000;
/** Bodies are base64 JSON: 4/3 of the ciphertext cap plus the other fields. */
const MAX_BODY_CHARS = Math.ceil((SHARE_MAX_CIPHERTEXT_BYTES * 4) / 3) + 4096;
const ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SHARE_API_PATH = /^\/api\/shares\/([0-9A-Za-z]{10})(\/open)?$/;
const TOO_LARGE = "This document is too large to share (the limit is 1 MB).";

export interface ApiOptions {
  now?: number;
  newId?: () => string;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

/** 10 random base62 characters (~59.5 bits), without modulo bias. */
export function newShareId(): string {
  let id = "";
  while (id.length < SHARE_ID_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < 248 && id.length < SHARE_ID_LENGTH) id += ID_ALPHABET.charAt(byte % 62);
    }
  }
  return id;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two hex digests. */
function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function decodedLength(value: unknown, field: string): number {
  if (typeof value !== "string") throw new HttpError(400, `Missing ${field}.`);
  try {
    return fromBase64(value).length;
  } catch {
    throw new HttpError(400, `Invalid ${field}.`);
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_CHARS) {
    throw new HttpError(413, TOO_LARGE);
  }
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) throw new HttpError(413, TOO_LARGE);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "Invalid request.");
  }
  return body as Record<string, unknown>;
}

function parseCreate(body: Record<string, unknown>): CreateShareRequest {
  const size = decodedLength(body.ciphertext, "ciphertext");
  if (size > SHARE_MAX_CIPHERTEXT_BYTES) throw new HttpError(413, TOO_LARGE);
  // AES-GCM output is the plaintext plus a 16-byte tag; an empty payload can't be valid JSON.
  if (size <= 16) throw new HttpError(400, "Invalid ciphertext.");
  if (decodedLength(body.iv, "iv") !== SHARE_IV_BYTES) throw new HttpError(400, "Invalid iv.");
  if (decodedLength(body.salt, "salt") !== SHARE_SALT_BYTES) {
    throw new HttpError(400, "Invalid salt.");
  }
  if (decodedLength(body.auth, "auth") !== SHARE_AUTH_BYTES) {
    throw new HttpError(400, "Invalid auth.");
  }
  const { iterations, ttlDays } = body;
  if (
    typeof iterations !== "number" ||
    !Number.isInteger(iterations) ||
    iterations < SHARE_MIN_ITERATIONS ||
    iterations > SHARE_MAX_ITERATIONS
  ) {
    throw new HttpError(400, "Invalid iterations.");
  }
  if (!isShareTtlDays(ttlDays)) throw new HttpError(400, "Expiry must be 1, 7 or 30 days.");
  return {
    ciphertext: body.ciphertext as string,
    iv: body.iv as string,
    salt: body.salt as string,
    auth: body.auth as string,
    iterations,
    ttlDays,
  };
}

const clientIp = (request: Request) => request.headers.get("cf-connecting-ip") ?? "unknown";

function assertLive<T extends { expires_at: number }>(
  row: T | null,
  now: number,
): asserts row is T {
  if (!row) throw new HttpError(404, "This link doesn't exist.");
  if (row.expires_at <= now) throw new HttpError(410, "This link has expired.");
}

async function createShare(
  request: Request,
  env: Env,
  now: number,
  newId: () => string,
): Promise<Response> {
  if (!(await env.CREATE_LIMITER.limit({ key: clientIp(request) })).success) {
    throw new HttpError(429, "Too many links created. Wait a minute and try again.");
  }
  const share = parseCreate(await readJson(request));
  const authHash = await sha256Hex(fromBase64(share.auth));
  const expiresAt = now + share.ttlDays * DAY_MS;
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newId();
    try {
      await env.DB.prepare(
        "INSERT INTO shares (id, ciphertext, iv, salt, iterations, auth_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          id,
          share.ciphertext,
          share.iv,
          share.salt,
          share.iterations,
          authHash,
          now,
          expiresAt,
        )
        .run();
      return json({ id, expiresAt } satisfies CreateShareResponse, 201);
    } catch (err) {
      if (!String(err).includes("UNIQUE")) throw err;
    }
  }
  throw new HttpError(503, "Couldn't create a link. Try again.");
}

async function shareMeta(env: Env, id: string, now: number): Promise<Response> {
  const row = await env.DB.prepare("SELECT salt, iterations, expires_at FROM shares WHERE id = ?")
    .bind(id)
    .first<{ salt: string; iterations: number; expires_at: number }>();
  assertLive(row, now);
  return json({
    salt: row.salt,
    iterations: row.iterations,
    expiresAt: row.expires_at,
  } satisfies ShareMeta);
}

async function openShare(request: Request, env: Env, id: string, now: number): Promise<Response> {
  if (!(await env.OPEN_LIMITER.limit({ key: clientIp(request) })).success) {
    throw new HttpError(429, "Too many attempts. Wait a minute and try again.");
  }
  const body = await readJson(request);
  if (decodedLength(body.auth, "auth") !== SHARE_AUTH_BYTES) {
    throw new HttpError(400, "Invalid auth.");
  }
  const row = await env.DB.prepare(
    "SELECT ciphertext, iv, auth_hash, expires_at FROM shares WHERE id = ?",
  )
    .bind(id)
    .first<{ ciphertext: string; iv: string; auth_hash: string; expires_at: number }>();
  assertLive(row, now);
  const proof = await sha256Hex(fromBase64(body.auth as string));
  if (!sameDigest(proof, row.auth_hash)) throw new HttpError(403, "Wrong password.");
  return json({ ciphertext: row.ciphertext, iv: row.iv } satisfies OpenShareResponse);
}

export async function handleApi(
  request: Request,
  env: Env,
  options: ApiOptions = {},
): Promise<Response> {
  const now = options.now ?? Date.now();
  const { pathname } = new URL(request.url);
  try {
    if (pathname === "/api/shares") {
      if (request.method !== "POST") throw new HttpError(405, "Method not allowed.");
      return await createShare(request, env, now, options.newId ?? newShareId);
    }
    const match = pathname.match(SHARE_API_PATH);
    const id = match?.[1];
    if (id) {
      if (match?.[2]) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed.");
        return await openShare(request, env, id, now);
      }
      if (request.method !== "GET") throw new HttpError(405, "Method not allowed.");
      return await shareMeta(env, id, now);
    }
    throw new HttpError(404, "Not found.");
  } catch (err) {
    if (err instanceof HttpError) {
      return json({ error: err.message } satisfies ShareErrorBody, err.status);
    }
    console.error(err);
    return json({ error: "Something went wrong." } satisfies ShareErrorBody, 500);
  }
}

/** Deletes expired shares; returns how many were removed. */
export async function purgeExpired(db: D1Like, now: number): Promise<number> {
  const { meta } = await db.prepare("DELETE FROM shares WHERE expires_at <= ?").bind(now).run();
  return meta.changes;
}
