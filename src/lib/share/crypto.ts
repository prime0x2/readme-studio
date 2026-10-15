import {
  fromBase64,
  parseSharePayload,
  SHARE_AUTH_BYTES,
  SHARE_IV_BYTES,
  SHARE_KDF_ITERATIONS,
  SHARE_SALT_BYTES,
  type SharePayload,
  toBase64,
} from "@/shared/share-protocol";

/**
 * End-to-end encryption for share links. The password never leaves the
 * browser: PBKDF2 stretches it once, and HKDF splits the result into an
 * AES-GCM key, which decrypts the document, and a separate access proof,
 * which lets the server hand out the ciphertext (it stores only a hash of the
 * proof).
 */

export interface ShareKeys {
  key: CryptoKey;
  /** Base64 access proof sent to the server. */
  auth: string;
}

export interface SealedShare {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
  auth: string;
}

/** HKDF `info` labels; changing either breaks every existing link. */
const ENC_INFO = "readmestudio/share/v1/enc";
const AUTH_INFO = "readmestudio/share/v1/auth";

const hkdfParams = (info: string): HkdfParams => ({
  name: "HKDF",
  hash: "SHA-256",
  salt: new Uint8Array(0),
  info: new TextEncoder().encode(info),
});

export async function deriveShareKeys(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<ShareKeys> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  // One SHA-256-sized PBKDF2 block: asking for more would run all the
  // iterations again per extra block, at no gain to an attacker's cost.
  const stretched = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    256,
  );
  const prk = await crypto.subtle.importKey("raw", stretched, "HKDF", false, [
    "deriveKey",
    "deriveBits",
  ]);
  const key = await crypto.subtle.deriveKey(
    hkdfParams(ENC_INFO),
    prk,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const auth = new Uint8Array(
    await crypto.subtle.deriveBits(hkdfParams(AUTH_INFO), prk, 8 * SHARE_AUTH_BYTES),
  );
  return { key, auth: toBase64(auth) };
}

export async function sealShare(
  payload: SharePayload,
  password: string,
  iterations: number = SHARE_KDF_ITERATIONS,
): Promise<SealedShare> {
  const salt = crypto.getRandomValues(new Uint8Array(SHARE_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(SHARE_IV_BYTES));
  const { key, auth } = await deriveShareKeys(password, salt, iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  return {
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
    salt: toBase64(salt),
    iterations,
    auth,
  };
}

/** Decrypts with an already-derived key; rejects if the key is wrong or the data was altered. */
export async function openSealedShare(
  sealed: { ciphertext: string; iv: string },
  key: CryptoKey,
): Promise<SharePayload> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv) },
    key,
    fromBase64(sealed.ciphertext),
  );
  return parseSharePayload(JSON.parse(new TextDecoder().decode(plaintext)));
}
