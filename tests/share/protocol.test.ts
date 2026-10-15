import { describe, expect, it } from "vitest";
import {
  fromBase64,
  isShareRoute,
  isShareTtlDays,
  parseSharePayload,
  shareIdFromPath,
  shareUrlFor,
  toBase64,
} from "../../src/shared/share-protocol";

describe("share protocol", () => {
  it("round-trips bytes through base64, including large buffers", () => {
    const bytes = new Uint8Array(300_000).map((_, i) => (i * 31) % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    expect(toBase64(new Uint8Array([104, 105]))).toBe("aGk=");
  });

  it("rejects invalid base64", () => {
    expect(() => fromBase64("not base64!")).toThrow();
  });

  it("reads share ids from /s/ paths", () => {
    expect(shareIdFromPath("/s/Ab3dE5gH9k")).toBe("Ab3dE5gH9k");
    expect(shareIdFromPath("/s/Ab3dE5gH9k/")).toBe("Ab3dE5gH9k");
    expect(shareIdFromPath("/s/short")).toBeNull();
    expect(shareIdFromPath("/s/Ab3dE5gH9k/extra")).toBeNull();
    expect(shareIdFromPath("/view")).toBeNull();
    expect(isShareRoute("/s/anything")).toBe(true);
    expect(isShareRoute("/view")).toBe(false);
    expect(shareUrlFor("Ab3dE5gH9k", "https://readme.prime0x2.dev")).toBe(
      "https://readme.prime0x2.dev/s/Ab3dE5gH9k",
    );
  });

  it("accepts only the offered expiry options", () => {
    expect([1, 7, 30].every(isShareTtlDays)).toBe(true);
    expect([0, 2, 365, "7", null].some(isShareTtlDays)).toBe(false);
  });

  it("validates decrypted payloads, keeping a well-formed document base", () => {
    const base = {
      raw: "https://raw.githubusercontent.com/o/r/main/README.md",
      web: "https://github.com/o/r/blob/main/README.md",
    };
    expect(parseSharePayload({ v: 1, markdown: "# Hi", title: "Hi", base })).toEqual({
      v: 1,
      markdown: "# Hi",
      title: "Hi",
      base,
    });
    expect(parseSharePayload({ v: 1, markdown: "x", title: 5, base: { raw: 3 } })).toEqual({
      v: 1,
      markdown: "x",
      title: null,
      base: null,
    });
    expect(() => parseSharePayload({ v: 2, markdown: "x" })).toThrow();
    expect(() => parseSharePayload({ v: 1 })).toThrow();
    expect(() => parseSharePayload("x")).toThrow();
  });

  describe("document base", () => {
    const raw = "https://raw.githubusercontent.com/o/r/main/README.md";
    const baseOf = (base: unknown) => parseSharePayload({ v: 1, markdown: "x", base }).base;

    it("keeps http(s) bases with any of the optional keys", () => {
      const full = {
        raw,
        rawRoot: "https://raw.githubusercontent.com/o/r/main/",
        web: "https://github.com/o/r/blob/main/README.md",
        webRoot: "http://github.com/o/r/blob/main/",
      };
      expect(baseOf(full)).toEqual(full);
      expect(baseOf({ raw })).toEqual({ raw });
      expect(baseOf({ raw, web: undefined })).toEqual({ raw });
    });

    it("rejects the whole base when any URL isn't absolute http(s)", () => {
      for (const hostile of [
        "javascript://x/%0aalert(document.domain)//",
        "JavaScript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "//evil.example/README.md",
        "docs/README.md",
        "/README.md",
        "",
        "not a url",
      ]) {
        expect(baseOf({ raw: hostile }), hostile).toBeNull();
        for (const key of ["rawRoot", "web", "webRoot"]) {
          expect(baseOf({ raw, [key]: hostile }), `${key}: ${hostile}`).toBeNull();
        }
      }
      expect(baseOf({ raw, web: null })).toBeNull();
      expect(baseOf({ raw, web: 5 })).toBeNull();
    });

    it("drops extra keys and copies into a fresh object", () => {
      const input = { raw, web: "https://github.com/o/r", evil: "javascript:alert(1)" };
      const base = baseOf(input);
      expect(base).toEqual({ raw, web: "https://github.com/o/r" });
      expect(base).not.toBe(input);
    });

    it("treats null, arrays and missing raw as no base", () => {
      expect(baseOf(null)).toBeNull();
      expect(baseOf(undefined)).toBeNull();
      expect(baseOf([raw])).toBeNull();
      expect(baseOf({ web: "https://github.com/o/r" })).toBeNull();
      expect(baseOf("https://github.com/o/r")).toBeNull();
    });
  });
});
