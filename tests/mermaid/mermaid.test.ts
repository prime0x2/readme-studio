/**
 * The live preview's Mermaid path, in real Chromium: the web app's lazy
 * renderer and its DOMPurify pass. Guards against diagrams that render as
 * empty boxes (labels are HTML inside <foreignObject>, which a stricter
 * sanitizer config would silently strip) and against script injection
 * through diagram labels, since share links render strangers' READMEs.
 */

import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PreviewTheme } from "@/shared";
import { type Bundle, buildBundle, interceptedPage, SITE } from "../browser-harness";

let browser: Browser;
let bundle: Bundle;
let page: Page;

beforeAll(async () => {
  bundle = await buildBundle({ styles: "src/styles.ts", entry: "tests/mermaid/entry.ts" });
  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const html = `<!doctype html><html><head><meta charset="utf-8">
${bundle
  .css("styles")
  .map((href) => `<link rel="stylesheet" href="${href}">`)
  .join("")}
<script type="module" src="${bundle.js("entry")}"></script></head>
<body><article class="markdown-body" style="width:900px"></article></body></html>`;
  page = await interceptedPage(browser, async (url) => {
    if (url.origin !== SITE) return null;
    if (url.pathname === "/") return { body: html, contentType: "text/html" };
    return bundle.file(url.pathname);
  });
  await page.goto(`${SITE}/`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => typeof window.renderPreview === "function");
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await bundle?.dispose();
});

/** Render into the article and report what the viewer would see. */
async function show(markdown: string, theme: PreviewTheme = "light") {
  return page.evaluate(
    async (md, t) => {
      const article = document.querySelector("article") as HTMLElement;
      article.dataset.theme = t;
      article.innerHTML = await window.renderPreview(md, t);
      const diagrams = [...article.querySelectorAll(".mermaid-diagram svg")];
      const visibleText = (svg: Element) =>
        [...svg.querySelectorAll("foreignObject, text")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && (el.textContent ?? "").trim().length > 0;
          })
          .map((el) => (el.textContent ?? "").trim());
      const firstNode = article.querySelector(
        ".mermaid-diagram .node rect, .mermaid-diagram rect.actor",
      );
      return {
        diagrams: diagrams.map((svg) => ({
          width: svg.getBoundingClientRect().width,
          labels: visibleText(svg),
        })),
        nodeFill: firstNode ? getComputedStyle(firstNode).fill : null,
        codeBlocks: [...article.querySelectorAll("pre")].map((pre) => pre.textContent ?? ""),
        handlers: article.querySelectorAll("[onerror], [onclick], [onload], script").length,
        injected: (window as unknown as { pwned?: boolean }).pwned === true,
      };
    },
    markdown,
    theme,
  );
}

/** Relative luminance of a computed `rgb(...)` color, 0 (black) to 1. */
function luminance(color: string | null): number {
  const [r = 0, g = 0, b = 0] = (color?.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const flowchart =
  "```mermaid\nflowchart LR\n  A[Write README] --> B{Looks good?}\n  B -->|Yes| C[Export PDF]\n```";

describe("Mermaid download failure", () => {
  it("shows diagrams as code and keeps every section rendering", async () => {
    let blockMermaid = true;
    const html = `<!doctype html><html><head><meta charset="utf-8">
<script type="module" src="${bundle.js("entry")}"></script></head><body><article></article></body></html>`;
    const fresh = await interceptedPage(browser, async (url) => {
      if (url.origin !== SITE) return null;
      if (url.pathname === "/") return { body: html, contentType: "text/html" };
      if (blockMermaid && url.pathname.includes("mermaid")) return null; // "network error"
      return bundle.file(url.pathname);
    });
    try {
      await fresh.goto(`${SITE}/`, { waitUntil: "networkidle0" });
      await fresh.waitForFunction(() => typeof window.renderPreview === "function");
      const render = (md: string) => fresh.evaluate((m) => window.renderPreview(m, "light"), md);

      const failed = await render(`intro text\n\n${flowchart}`);
      expect(failed).toContain("intro text"); // the rest of the section survives
      expect(failed).toContain("Write README"); // the diagram, as code
      expect(failed).not.toContain("mermaid-diagram");

      // Later renders in the same page degrade the same way — never an
      // error for the whole section. (Browsers cache the failed module
      // fetch until reload, so there's no in-page recovery to test.)
      blockMermaid = false;
      const later = await render(`${flowchart}\n\nagain`);
      expect(later).toContain("again");
      expect(later).toContain("Write README");
    } finally {
      await fresh.close();
    }
  }, 60_000);
});

describe("Mermaid in the live preview", () => {
  it("renders flowcharts and sequence diagrams with visible labels", async () => {
    const result = await show(
      `${flowchart}\n\n\`\`\`mermaid\nsequenceDiagram\n  Alice->>Bob: Hello Bob\n\`\`\``,
    );
    expect(result.diagrams).toHaveLength(2);
    for (const diagram of result.diagrams) expect(diagram.width).toBeGreaterThan(50);
    const labels = result.diagrams.flatMap((d) => d.labels).join(" | ");
    for (const label of [
      "Write README",
      "Looks good?",
      "Export PDF",
      "Yes",
      "Alice",
      "Hello Bob",
    ]) {
      expect(labels).toContain(label);
    }
  }, 60_000);

  it("renders Bengali labels", async () => {
    const result = await show("```mermaid\nflowchart TD\n  ক[শুরু] --> খ[শেষ]\n```");
    expect(result.diagrams[0]?.labels.join(" ")).toContain("শুরু");
  }, 60_000);

  it("follows the preview theme", async () => {
    const light = await show(flowchart, "light");
    const dark = await show(flowchart, "dark");
    expect(luminance(light.nodeFill)).toBeGreaterThan(0.6);
    expect(luminance(dark.nodeFill)).toBeLessThan(0.4);
  }, 60_000);

  it("keeps an invalid diagram as a code block", async () => {
    const result = await show("```mermaid\nflowchart LR\n  A -->\n  ??? oops\n```");
    expect(result.diagrams).toHaveLength(0);
    expect(result.codeBlocks.join("")).toContain("??? oops");
  }, 60_000);

  it("never runs script from a diagram", async () => {
    const result = await show(
      [
        "```mermaid",
        "flowchart LR",
        '  A["<img src=x onerror=window.pwned=true>"] --> B["<script>window.pwned=true</script>"]',
        "  click A call window.pwned=true",
        '  click B href "javascript:window.pwned=true"',
        "```",
      ].join("\n"),
    );
    await new Promise((resolve) => setTimeout(resolve, 300)); // let any onerror fire
    const after = await page.evaluate(
      () => (window as unknown as { pwned?: boolean }).pwned === true,
    );
    expect(result.handlers).toBe(0);
    expect(result.injected || after).toBe(false);
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll("article a")].map((a) => a.getAttribute("href") ?? ""),
    );
    for (const href of hrefs) expect(href.toLowerCase()).not.toContain("javascript:");
  }, 60_000);
});
