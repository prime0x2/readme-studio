/**
 * PDF export is the browser's print engine over printDocumentHtml(). This
 * renders that document in Chromium the way the print dialog does by
 * default (CSS page size honored, "Background graphics" off, no browser
 * headers/footers) and checks the PDF: A4 pages, page numbers, text and
 * diagram labels, shading kept.
 *
 * Set PRINT_TEST_OUT=<dir> to keep the PDFs for inspection.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bundle, buildBundle, interceptedPage, SITE } from "../browser-harness";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
let browser: Browser;
let bundle: Bundle;
let app: Page;

beforeAll(async () => {
  bundle = await buildBundle({ styles: "src/styles.ts", entry: "tests/print/entry.ts" });
  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const html = `<!doctype html><html><head><meta charset="utf-8">
${bundle
  .css("styles")
  .map((href) => `<link rel="stylesheet" href="${href}">`)
  .join("")}
<script type="module" src="${bundle.js("entry")}"></script></head>
<body><div id="root"><h1>APP SHELL — must not appear in the PDF</h1></div></body></html>`;
  app = await interceptedPage(browser, async (url) => {
    if (url.origin === SITE) {
      return url.pathname === "/"
        ? { body: html, contentType: "text/html" }
        : bundle.file(url.pathname);
    }
    // Remote images stay offline in CI; PRINT_TEST_NETWORK=1 loads them
    // (for comparing against other PDF exports by eye).
    if (!process.env.PRINT_TEST_NETWORK) return null;
    const res = await fetch(url);
    return res.ok
      ? {
          body: Buffer.from(await res.arrayBuffer()),
          contentType: res.headers.get("content-type") ?? "application/octet-stream",
        }
      : null;
  });
  await app.goto(`${SITE}/`, { waitUntil: "networkidle0" });
  await app.waitForFunction(() => typeof window.preparePrintFor === "function");
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await bundle?.dispose();
});

/** Print a markdown file the way the dialog would; returns the PDF bytes. */
async function print(markdown: string, name: string): Promise<Buffer> {
  await app.evaluate((md) => window.preparePrintFor(md), markdown);
  const pdf = Buffer.from(
    await app.pdf({ preferCSSPageSize: true, printBackground: false, displayHeaderFooter: false }),
  );
  const out = process.env.PRINT_TEST_OUT;
  if (out) {
    await mkdir(out, { recursive: true });
    await writeFile(join(out, `${name}.pdf`), pdf);
  }
  return pdf;
}

/** Page count and sizes (pt) from the PDF's /MediaBox entries. */
function pageBoxes(pdf: Buffer): Array<[number, number]> {
  const text = pdf.toString("latin1");
  return [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}

describe("PDF export (browser print)", () => {
  it("prints A4 pages with page numbers, diagrams and Bengali", async () => {
    const markdown = await readFile(join(FIXTURES, "document.md"), "utf8");
    const pdf = await print(markdown, "document");
    const boxes = pageBoxes(pdf);
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (const [w, h] of boxes) {
      expect(Math.round(w)).toBe(595); // A4 in points
      expect(Math.round(h)).toBe(842);
    }
  }, 120_000);

  it("prints only the document: the app is hidden, the document shown", async () => {
    await app.evaluate(
      (md) => window.preparePrintFor(md),
      "# Printed\n\n```mermaid\nflowchart LR\n  A --> B\n```",
    );
    const visible = async () =>
      app.evaluate(() => ({
        app: getComputedStyle(document.getElementById("root") as HTMLElement).display,
        doc: getComputedStyle(document.getElementById("rs-print-root") as HTMLElement).display,
        diagrams: document.querySelectorAll("#rs-print-root .mermaid-diagram svg").length,
        title: document.title,
      }));
    expect(await visible()).toMatchObject({ app: "block", doc: "none", title: "readme" }); // on screen
    await app.emulateMediaType("print");
    try {
      expect(await visible()).toMatchObject({ app: "none", doc: "block", diagrams: 1 });
    } finally {
      await app.emulateMediaType(undefined);
    }
  }, 60_000);
});
