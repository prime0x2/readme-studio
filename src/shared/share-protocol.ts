import type { DocumentBase } from "./resolve-urls";
import { MARKDOWN_BYTE_LIMIT } from "./types";

/**
 * Wire format and limits for password-protected share links, shared by the
 * browser (src/lib/share/) and the Worker (worker/). The server only ever
 * sees ciphertext; see
 * SPEC.md §10 (Share by Link).
 */

export const SHARE_TTL_DAYS = [1, 7, 30] as const;
export type ShareTtlDays = (typeof SHARE_TTL_DAYS)[number];
export const DEFAULT_SHARE_TTL_DAYS: ShareTtlDays = 7;

/** PBKDF2-SHA256 iterations for new shares (OWASP 2023). Stored per share. */
export const SHARE_KDF_ITERATIONS = 600_000;
export const SHARE_MIN_ITERATIONS = 100_000;
export const SHARE_MAX_ITERATIONS = 5_000_000;
export const SHARE_MIN_PASSWORD_LENGTH = 8;

export const SHARE_SALT_BYTES = 16;
export const SHARE_IV_BYTES = 12;
export const SHARE_AUTH_BYTES = 32;
/** The 1 MiB markdown cap plus room for the JSON wrapper and the GCM tag. */
export const SHARE_MAX_CIPHERTEXT_BYTES = MARKDOWN_BYTE_LIMIT + 64 * 1024;

export const SHARE_ID_LENGTH = 10;
const SHARE_PATH = /^\/s\/([0-9A-Za-z]{10})\/?$/;

/** POST /api/shares */
export interface CreateShareRequest {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
  /** Access proof; the server stores only its SHA-256. */
  auth: string;
  ttlDays: ShareTtlDays;
}
export interface CreateShareResponse {
  id: string;
  expiresAt: number;
}
/** GET /api/shares/:id */
export interface ShareMeta {
  salt: string;
  iterations: number;
  expiresAt: number;
}
/** POST /api/shares/:id/open */
export interface OpenShareRequest {
  auth: string;
}
export interface OpenShareResponse {
  ciphertext: string;
  iv: string;
}
export interface ShareErrorBody {
  error: string;
}

/** What gets encrypted. `base` lets relative images of an imported README resolve. */
export interface SharePayload {
  v: 1;
  markdown: string;
  title: string | null;
  base: DocumentBase | null;
}

export function isShareTtlDays(value: unknown): value is ShareTtlDays {
  return SHARE_TTL_DAYS.includes(value as ShareTtlDays);
}

/** "/s/<id>" → id; anything else, including a malformed id, → null. */
export function shareIdFromPath(pathname: string): string | null {
  return pathname.match(SHARE_PATH)?.[1] ?? null;
}

/** Every /s/… address belongs to the share page (it shows "doesn't exist" for bad ids). */
export function isShareRoute(pathname: string): boolean {
  return pathname.startsWith("/s/");
}

export function shareUrlFor(id: string, origin: string): string {
  return `${origin}/s/${id}`;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Throws on input that isn't base64. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isDocumentBase(value: unknown): value is DocumentBase {
  if (typeof value !== "object" || value === null) return false;
  const base = value as Record<string, unknown>;
  return (
    typeof base.raw === "string" &&
    ["rawRoot", "web", "webRoot"].every(
      (key) => base[key] === undefined || typeof base[key] === "string",
    )
  );
}

/** Validates decrypted JSON; throws on anything that isn't a v1 payload. */
export function parseSharePayload(value: unknown): SharePayload {
  if (typeof value !== "object" || value === null) throw new Error("Not a share payload.");
  const payload = value as Record<string, unknown>;
  if (payload.v !== 1 || typeof payload.markdown !== "string") {
    throw new Error("Unsupported share payload.");
  }
  return {
    v: 1,
    markdown: payload.markdown,
    title: typeof payload.title === "string" ? payload.title : null,
    base: isDocumentBase(payload.base) ? payload.base : null,
  };
}
