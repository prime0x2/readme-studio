import { describe, expect, it } from "vitest";
import { deriveShareKeys, openSealedShare, sealShare } from "../../src/lib/share/crypto";
import { fromBase64, type SharePayload, toBase64 } from "../../src/shared/share-protocol";

/** Test-only iteration count; production uses SHARE_KDF_ITERATIONS (600 000). */
const FAST = 1_000;
const payload: SharePayload = {
  v: 1,
  markdown: "# Aurora\n\nবাংলা টেক্সট 🚀\n",
  title: "Aurora",
  base: { raw: "https://raw.githubusercontent.com/o/r/main/README.md" },
};

describe("share crypto", () => {
  it("round-trips a payload with the right password", async () => {
    const sealed = await sealShare(payload, "correct horse", FAST);
    const { key, auth } = await deriveShareKeys(
      "correct horse",
      fromBase64(sealed.salt),
      sealed.iterations,
    );
    expect(auth).toBe(sealed.auth);
    expect(await openSealedShare(sealed, key)).toEqual(payload);
  });

  it("fails to decrypt with a wrong password", async () => {
    const sealed = await sealShare(payload, "correct horse", FAST);
    const { key, auth } = await deriveShareKeys("wrong horse", fromBase64(sealed.salt), FAST);
    expect(auth).not.toBe(sealed.auth);
    await expect(openSealedShare(sealed, key)).rejects.toThrow();
  });

  it("never puts the plaintext or password in what it uploads", async () => {
    const sealed = await sealShare(payload, "correct horse", FAST);
    const uploaded =
      new TextDecoder("latin1").decode(fromBase64(sealed.ciphertext)) + JSON.stringify(sealed);
    expect(uploaded).not.toContain("Aurora");
    expect(uploaded).not.toContain("correct horse");
  });

  it("uses a fresh salt and IV for every share", async () => {
    const a = await sealShare(payload, "pw123456", FAST);
    const b = await sealShare(payload, "pw123456", FAST);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("treats composed and decomposed accented passwords as the same", async () => {
    const salt = new Uint8Array(16);
    const composed = await deriveShareKeys("café-secret", salt, FAST);
    const decomposed = await deriveShareKeys("café-secret", salt, FAST);
    expect(decomposed.auth).toBe(composed.auth);
  });

  it("rejects a tampered ciphertext", async () => {
    const sealed = await sealShare(payload, "correct horse", FAST);
    const bytes = fromBase64(sealed.ciphertext);
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    const { key } = await deriveShareKeys("correct horse", fromBase64(sealed.salt), FAST);
    await expect(
      openSealedShare({ ...sealed, ciphertext: toBase64(bytes) }, key),
    ).rejects.toThrow();
  });
});
