/**
 * DOCX export's browser half in real Chromium: fetching images (with and
 * without CORS), rasterizing SVG badges and Mermaid diagrams through a
 * canvas, and a full export with both. The builder itself is covered in
 * Node by tests/docx.test.ts.
 */
import { strFromU8, unzipSync } from "fflate";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bundle, buildBundle, interceptedPage, SITE } from "../browser-harness";

const IMAGES = "https://img.readmestudio.test";
const BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20"><rect width="120" height="20" fill="#555"/><text x="10" y="14" fill="#fff" font-family="Verdana" font-size="11">build passing</text></svg>`;
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

let browser: Browser;
let bundle: Bundle;
let page: Page;

beforeAll(async () => {
  bundle = await buildBundle({ entry: "tests/docx-browser/entry.ts" });
  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const html = `<!doctype html><html><head><meta charset="utf-8">
<script type="module" src="${bundle.js("entry")}"></script></head><body></body></html>`;
  page = await interceptedPage(browser, async (url) => {
    if (url.origin === IMAGES) {
      // /cors/* allows cross-origin reads (like shields.io); /nocors/* doesn't.
      const cors = url.pathname.startsWith("/cors/");
      const headers = cors ? { "access-control-allow-origin": "*" } : undefined;
      if (url.pathname.endsWith(".svg"))
        return { body: BADGE_SVG, contentType: "image/svg+xml", headers };
      if (url.pathname.endsWith(".png"))
        return { body: PNG_1X1, contentType: "image/png", headers };
      return null;
    }
    if (url.origin !== SITE) return null;
    if (url.pathname === "/") return { body: html, contentType: "text/html" };
    return bundle.file(url.pathname);
  });
  await page.goto(`${SITE}/`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => typeof window.docxTest === "object");
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await bundle?.dispose();
});

describe("DOCX export in the browser", () => {
  it("rasterizes an SVG badge to a PNG at its natural size", async () => {
    const image = await page.evaluate(
      (u) => window.docxTest.loadImage(u),
      `${IMAGES}/cors/badge.svg`,
    );
    expect(image).toMatchObject({ type: "png", naturalWidth: 120, naturalHeight: 20 });
    expect(image?.magic).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("keeps a PNG as-is", async () => {
    const image = await page.evaluate(
      (u) => window.docxTest.loadImage(u),
      `${IMAGES}/cors/dot.png`,
    );
    expect(image).toMatchObject({
      type: "png",
      naturalWidth: 1,
      naturalHeight: 1,
      bytes: PNG_1X1.length,
    });
  });

  it("gives up quietly on hosts that don't allow CORS (alt text instead)", async () => {
    const image = await page.evaluate(
      (u) => window.docxTest.loadImage(u),
      `${IMAGES}/nocors/badge.svg`,
    );
    expect(image).toBeNull();
  });

  it("rasterizes Mermaid diagrams, including Bengali labels", async () => {
    for (const source of [
      "flowchart LR\n  A[Write README] --> B[Export]",
      "flowchart TD\n  ক[শুরু] --> খ[শেষ]",
    ]) {
      const diagram = await page.evaluate((s) => window.docxTest.rasterize(s), source);
      expect(diagram?.width).toBeGreaterThan(50);
      expect(diagram?.height).toBeGreaterThan(20);
      expect(diagram?.ink).toBeGreaterThan(100); // lines and label text were drawn
    }
    expect(await page.evaluate(() => window.docxTest.rasterize("not a diagram ???"))).toBeNull();
  }, 60_000);

  it("exports a DOCX with badges, diagrams, and alt text for blocked images", async () => {
    const bytes = await page.evaluate(
      (md) => window.docxTest.buildDocx(md),
      `# Doc\n\n![ok](${IMAGES}/cors/badge.svg) ![blocked badge](${IMAGES}/nocors/badge.svg)\n\n\`\`\`mermaid\nflowchart LR\n  A --> B\n\`\`\``,
    );
    const files = unzipSync(Uint8Array.from(bytes));
    const media = Object.keys(files).filter((f) => f.startsWith("word/media/") && !f.endsWith("/"));
    expect(media).toHaveLength(2); // the badge and the diagram
    expect(strFromU8(files["word/document.xml"] ?? new Uint8Array())).toContain("[blocked badge]");
  }, 60_000);
});
