import type { DocumentBase } from "@/shared";
import {
  type CreateShareResponse,
  fromBase64,
  type OpenShareResponse,
  SHARE_MIN_PASSWORD_LENGTH,
  type ShareMeta,
  type SharePayload,
  type ShareTtlDays,
  shareUrlFor,
} from "@/shared/share-protocol";
import { MARKDOWN_BYTE_LIMIT } from "@/shared/types";
import { deriveShareKeys, openSealedShare, sealShare } from "./crypto";

/** A failed share action, with a message that can be shown as-is. Status 0 = no response. */
export class ShareError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ShareError";
    this.status = status;
  }
}

export interface ShareInput {
  markdown: string;
  title: string | null;
  base: DocumentBase | null;
  password: string;
  ttlDays: ShareTtlDays;
}

export interface CreatedShare {
  url: string;
  expiresAt: number;
}

/** The dialog's checks, before anything is encrypted. Returns an error message or null. */
export function checkShareInput(
  markdown: string,
  password: string,
  confirm: string,
): string | null {
  if (new TextEncoder().encode(markdown).length > MARKDOWN_BYTE_LIMIT) {
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
  const sealed = await sealShare(
    { v: 1, markdown: input.markdown, title: input.title, base: input.base },
    input.password,
    options.iterations,
  );
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

/** Derives the keys from the password, proves them to the server, decrypts locally. */
export async function unlockShare(
  id: string,
  meta: ShareMeta,
  password: string,
): Promise<SharePayload> {
  const { key, auth } = await deriveShareKeys(password, fromBase64(meta.salt), meta.iterations);
  const sealed = await call<OpenShareResponse>(`/api/shares/${id}/open`, postJson({ auth }));
  try {
    return await openSealedShare(sealed, key);
  } catch {
    throw new ShareError("This link's data is damaged and can't be opened.", 0);
  }
}
