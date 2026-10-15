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
 * browser: PBKDF2 stretches it into an AES-GCM key, which decrypts the
 * document, and a separate access proof, which lets the server hand out the
 * ciphertext (it stores only a hash of the proof).
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

const KEY_BYTES = 32;

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
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      material,
      8 * (KEY_BYTES + SHARE_AUTH_BYTES),
    ),
  );
  const key = await crypto.subtle.importKey("raw", bits.slice(0, KEY_BYTES), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return { key, auth: toBase64(bits.slice(KEY_BYTES)) };
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
