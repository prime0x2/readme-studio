import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkShareInput,
  createShareLink,
  fetchShareMeta,
  unlockShare,
} from "../../src/lib/share/api";
import { SHARE_MAX_CIPHERTEXT_BYTES } from "../../src/shared/share-protocol";
import { MARKDOWN_BYTE_LIMIT } from "../../src/shared/types";
import { handleApi } from "../../worker/shares";
import { createTestEnv } from "../worker/fake-env";

const ORIGIN = "https://readme.test";
const markdown = "# Plan\n\nনমস্কার 👋\n";

async function share(password = "correct horse") {
  const created = await createShareLink(
    { markdown, title: "Plan", base: null, password, ttlDays: 7 },
    { origin: ORIGIN, iterations: 100_000 },
  );
  return created.url.split("/").at(-1) as string;
}

describe("share client", () => {
  beforeEach(() => {
    const { env } = createTestEnv();
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      handleApi(new Request(new URL(String(input), ORIGIN), init), env),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shares and unlocks a document end to end", async () => {
    const created = await createShareLink(
      { markdown, title: "Plan", base: null, password: "correct horse", ttlDays: 7 },
      { origin: ORIGIN, iterations: 100_000 },
    );
    expect(created.url).toMatch(/^https:\/\/readme\.test\/s\/[0-9A-Za-z]{10}$/);
    const id = created.url.split("/").at(-1) as string;
    const meta = await fetchShareMeta(id);
    expect(await unlockShare(id, meta, "correct horse")).toEqual({
      v: 1,
      markdown,
      title: "Plan",
      base: null,
    });
  });

  it("reports a wrong password", async () => {
    const id = await share();
    const meta = await fetchShareMeta(id);
    await expect(unlockShare(id, meta, "correct horsE")).rejects.toMatchObject({
      status: 403,
      message: "Wrong password.",
    });
  });

  it("refuses KDF parameters outside the protocol's limits before deriving", async () => {
    const id = await share();
    const meta = await fetchShareMeta(id);
    const opens = vi.fn(fetch);
    vi.stubGlobal("fetch", opens);
    for (const bad of [
      { iterations: 1_000 },
      { iterations: 5_000_001 },
      { iterations: 100_000.5 },
      { iterations: "100000" },
      { iterations: Number.NaN },
      { salt: "!!!" },
      { salt: "AAAAAAAAAAA=" },
      { salt: 42 },
    ]) {
      await expect(
        unlockShare(id, { ...meta, ...bad } as typeof meta, "correct horse"),
        JSON.stringify(bad),
      ).rejects.toMatchObject({
        name: "ShareError",
        status: 0,
        message: "This link's data is damaged and can't be opened.",
      });
    }
    expect(opens).not.toHaveBeenCalled();
  });

  it("reports links that don't exist", async () => {
    await expect(fetchShareMeta("AAAAAAAAAA")).rejects.toMatchObject({
      status: 404,
      message: "This link doesn't exist.",
    });
  });

  it("reports network failures", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchShareMeta("AAAAAAAAAA")).rejects.toMatchObject({
      status: 0,
      message: "Couldn't reach the server. Check your connection.",
    });
  });
});

describe("checkShareInput", () => {
  const doc = { markdown, title: "Plan", base: null };
  const TOO_LARGE = "This document is too large to share (the limit is 1 MB).";
  /** JSON of a payload with empty fields: what the wrapper itself costs. */
  const WRAPPER = JSON.stringify({ v: 1, markdown: "", title: "", base: null }).length;

  it("accepts a good password and a normal document", () => {
    expect(checkShareInput(doc, "correct horse", "correct horse")).toBeNull();
  });

  it("requires 8 characters and matching passwords", () => {
    expect(checkShareInput(doc, "short", "short")).toBe("Use a password of at least 8 characters.");
    expect(checkShareInput(doc, "correct horse", "correct house")).toBe(
      "The passwords don't match.",
    );
  });

  it("refuses documents over 1 MB, counting bytes not characters", () => {
    const bengali = "ক".repeat(Math.ceil(MARKDOWN_BYTE_LIMIT / 3) + 1); // 3 bytes each in UTF-8
    expect(checkShareInput({ ...doc, markdown: bengali }, "correct horse", "correct horse")).toBe(
      TOO_LARGE,
    );
  });

  it("measures the encrypted payload, so JSON escaping can't overflow the server cap", () => {
    // Under 1 MB of markdown, but every quote doubles once JSON-encoded.
    const quotes = '"'.repeat(MARKDOWN_BYTE_LIMIT - 1);
    expect(checkShareInput({ ...doc, markdown: quotes }, "correct horse", "correct horse")).toBe(
      TOO_LARGE,
    );
  });

  it("accepts exactly the largest payload the server stores, and nothing bigger", async () => {
    const { env } = createTestEnv();
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      handleApi(new Request(new URL(String(input), ORIGIN), init), env),
    );
    const fill = SHARE_MAX_CIPHERTEXT_BYTES - 16 - WRAPPER - MARKDOWN_BYTE_LIMIT;
    const largest = {
      markdown: "a".repeat(MARKDOWN_BYTE_LIMIT),
      title: "t".repeat(fill),
      base: null,
    };
    expect(checkShareInput(largest, "correct horse", "correct horse")).toBeNull();
    await expect(
      createShareLink(
        { ...largest, password: "correct horse", ttlDays: 1 },
        { origin: ORIGIN, iterations: 100_000 },
      ),
    ).resolves.toMatchObject({ url: expect.stringContaining("/s/") });

    const over = { ...largest, title: `${largest.title}t` };
    expect(checkShareInput(over, "correct horse", "correct horse")).toBe(TOO_LARGE);
    vi.unstubAllGlobals();
  });
});
