import type { DocumentBase } from "@/shared";
import {
  type CreateShareResponse,
  fromBase64,
  type OpenShareResponse,
  SHARE_MAX_ITERATIONS,
  SHARE_MAX_PAYLOAD_BYTES,
  SHARE_MIN_ITERATIONS,
  SHARE_MIN_PASSWORD_LENGTH,
  SHARE_SALT_BYTES,
  type ShareMeta,
  type SharePayload,
  type ShareTtlDays,
  shareUrlFor,
} from "@/shared/share-protocol";
import { MARKDOWN_BYTE_LIMIT } from "@/shared/types";
import { deriveShareKeys, openSealedShare, type ShareKeys, sealShare } from "./crypto";

/** A failed share action, with a message that can be shown as-is. Status 0 = no response. */
export class ShareError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ShareError";
    this.status = status;
  }
}

/** What gets shared: the document as the editor holds it. */
export interface ShareDocument {
  markdown: string;
  title: string | null;
  base: DocumentBase | null;
}

export interface ShareInput extends ShareDocument {
  password: string;
  ttlDays: ShareTtlDays;
}

const payloadOf = ({ markdown, title, base }: ShareDocument): SharePayload => ({
  v: 1,
  markdown,
  title,
  base,
});

const utf8Length = (text: string) => new TextEncoder().encode(text).length;

export interface CreatedShare {
  url: string;
  expiresAt: number;
}

/** The dialog's checks, before anything is encrypted. Returns an error message or null. */
export function checkShareInput(
  doc: ShareDocument,
  password: string,
  confirm: string,
): string | null {
  // The markdown limit is the one users see; the payload check covers what
  // JSON escaping, the title and the base add, so the server never answers 413.
  if (
    utf8Length(doc.markdown) > MARKDOWN_BYTE_LIMIT ||
    utf8Length(JSON.stringify(payloadOf(doc))) > SHARE_MAX_PAYLOAD_BYTES
  ) {
    return "This document is too large to share (the limit is 1 MB).";
  }
  if (password.length < SHARE_MIN_PASSWORD_LENGTH) {
    return `Use a password of at least ${SHARE_MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) return "The passwords don't match.";
  return null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ShareError("Couldn't reach the server. Check your connection.", 0);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || body === null) {
    throw new ShareError(body?.error ?? "Something went wrong. Try again.", res.status);
  }
  return body;
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Encrypts the document in this browser and uploads only the ciphertext. */
export async function createShareLink(
  input: ShareInput,
  options: { origin?: string; iterations?: number } = {},
): Promise<CreatedShare> {
  const sealed = await sealShare(payloadOf(input), input.password, options.iterations);
  const created = await call<CreateShareResponse>(
    "/api/shares",
    postJson({ ...sealed, ttlDays: input.ttlDays }),
  );
  return {
    url: shareUrlFor(created.id, options.origin ?? window.location.origin),
    expiresAt: created.expiresAt,
  };
}

export function fetchShareMeta(id: string): Promise<ShareMeta> {
  return call<ShareMeta>(`/api/shares/${id}`);
}

const damaged = () => new ShareError("This link's data is damaged and can't be opened.", 0);

/**
 * Derives the keys from the password, proves them to the server, decrypts
 * locally. The KDF parameters come from the server, so they're checked against
 * the protocol's limits first: a hostile server could otherwise make this
 * browser spin on a huge iteration count, or weaken the key with a tiny one.
 */
export async function unlockShare(
  id: string,
  meta: ShareMeta,
  password: string,
): Promise<SharePayload> {
  const { iterations } = meta;
  if (
    !Number.isInteger(iterations) ||
    iterations < SHARE_MIN_ITERATIONS ||
    iterations > SHARE_MAX_ITERATIONS
  ) {
    throw damaged();
  }
  let keys: ShareKeys;
  try {
    const salt = fromBase64(meta.salt);
    if (salt.length !== SHARE_SALT_BYTES) throw damaged();
    keys = await deriveShareKeys(password, salt, iterations);
  } catch {
    throw damaged();
  }
  const sealed = await call<OpenShareResponse>(
    `/api/shares/${id}/open`,
    postJson({ auth: keys.auth }),
  );
  try {
    return await openSealedShare(sealed, keys.key);
  } catch {
    throw damaged();
  }
}
