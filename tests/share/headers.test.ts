import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** Inline scripts the browser runs: no src, and not a data block such as JSON-LD. */
function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/script>/g)]
    .filter(({ groups }) => !/\bsrc=|type="application\/ld\+json"/.test(groups?.attrs ?? ""))
    .map(({ groups }) => groups?.body ?? "");
}

function shareHeaders(): Map<string, string> {
  const lines = read("public/_headers").split("\n");
  const start = lines.findIndex((line) => line.trim() === "/s/*");
  const headers = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break;
    const [name = "", ...value] = line.trim().split(":");
    headers.set(name.toLowerCase(), value.join(":").trim());
  }
  return headers;
}

describe("share page headers", () => {
  it("keep shared documents out of search engines and referrers", () => {
    const headers = shareHeaders();
    expect(headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("allow only same-origin scripts plus the exact inline scripts of index.html", () => {
    const csp = shareHeaders().get("content-security-policy") ?? "";
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    const scripts = inlineScripts(read("index.html"));
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      const hash = createHash("sha256").update(script, "utf8").digest("base64");
      // Editing an inline script in index.html changes its hash: update public/_headers.
      expect(csp, "public/_headers is missing an index.html inline script hash").toContain(
        `'sha256-${hash}'`,
      );
    }
  });
});
