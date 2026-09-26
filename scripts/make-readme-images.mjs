// One-off: regenerate the README images in .github/assets/ from the real app.
//
//   pnpm build && pnpm exec vite preview --port 3055     # in one terminal
//   node scripts/make-readme-images.mjs [app-url]        # in another
//
// Screenshots a sample document in the running app (light and dark), prints
// it through the app's own PDF path, and composes the cover and screenshot
// cards with Puppeteer. Needs `pdftoppm` (poppler-utils) for the PDF page.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const APP = process.argv[2] ?? "http://localhost:3055";
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../.github/assets");
mkdirSync(OUT, { recursive: true });

const sections = [
  {
    name: "Title and Description",
    markdown: `# Aurora

![build](https://img.shields.io/badge/build-passing-brightgreen) ![version](https://img.shields.io/badge/version-1.4.0-blue) ![license](https://img.shields.io/badge/license-MIT-green)

A tiny, fast static-site generator. Write Markdown, get a site that loads in under 100 ms.`,
  },
  {
    name: "Architecture",
    markdown: `## Architecture

\`\`\`mermaid
flowchart LR
  A[Markdown] --> B(Parser)
  B --> C{Cache hit?}
  C -->|yes| D[Output]
  C -->|no| E[Renderer]
  E --> D
\`\`\``,
  },
  {
    name: "Features",
    markdown: `## Features

- ⚡ Incremental builds — only changed pages re-render
- 🎨 Themes with zero client-side JavaScript
- 🔍 Built-in full-text search index

> [!TIP]
> Run \`aurora dev\` for live reload while you write.`,
  },
  {
    name: "Installation",
    markdown: `## Installation

\`\`\`bash
npm install -g aurora-ssg
aurora new my-site && cd my-site
aurora dev
\`\`\``,
  },
  {
    name: "Benchmarks",
    markdown: `## Benchmarks

| Pages | Aurora | Next best |
| ---: | ---: | ---: |
| 1,000 | 0.8 s | 4.1 s |
| 10,000 | 6.2 s | 39.5 s |`,
  },
].map((s, i) => ({ id: `s${i}`, slug: `custom-${i}`, isCustom: true, ...s }));

function storedDoc(uiTheme) {
  return JSON.stringify({
    state: {
      sections,
      trash: [],
      selectedId: "s1",
      uiTheme,
      previewRatio: 0.5,
      sidebarCollapsed: false,
      documentBase: null,
    },
    version: 2,
  });
}

const browser = await puppeteer.launch({ headless: true });

async function appShot(uiTheme) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto(APP, { waitUntil: "networkidle0" });
  await page.evaluate(
    (doc) => localStorage.setItem("readmestudio:doc:v1", doc),
    storedDoc(uiTheme),
  );
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".mermaid-diagram svg", { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 500));
  const png = await page.screenshot({ type: "png" });

  let pdf = null;
  if (uiTheme === "light") {
    // The app's real PDF path: build the print root, then print it.
    await page.evaluate(() => {
      window.__printed = false;
      window.print = () => {
        window.__printed = true;
      };
    });
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (e) => e.textContent.trim() === "PDF",
      );
      b.click();
    });
    await page.waitForFunction(() => window.__printed, { timeout: 30000 });
    pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  }
  await page.close();
  return { png, pdf };
}

const dataUrl = (buf) => `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;

const FONTS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap">`;

const BOOK = `<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M16 9.5c-1.8-1.4-4.2-1.9-6.5-1.6v13.4c2.3-.3 4.7.2 6.5 1.6 1.8-1.4 4.2-1.9 6.5-1.6V7.9c-2.3-.3-4.7.2-6.5 1.6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 9.5v13.4" stroke="currentColor" stroke-width="1.8"/></svg>`;

/** A browser window around a screenshot. */
function windowFrame(src, { dark = false, width }) {
  const bar = dark ? "#1c1917" : "#ffffff";
  const url = dark ? "#292524" : "#f5f5f4";
  const urlText = dark ? "#a8a29e" : "#78716c";
  return `
  <div style="width:${width}px;border-radius:14px;overflow:hidden;box-shadow:0 30px 80px -10px rgba(40,12,0,.45),0 0 0 1px rgba(0,0,0,.08);background:${bar}">
    <div style="height:40px;display:flex;align-items:center;gap:8px;padding:0 16px;background:${bar};border-bottom:1px solid ${dark ? "#292524" : "#e7e5e4"}">
      <span style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></span>
      <span style="width:12px;height:12px;border-radius:50%;background:#febc2e"></span>
      <span style="width:12px;height:12px;border-radius:50%;background:#28c840"></span>
      <div style="margin:0 auto;transform:translateX(-30px);background:${url};color:${urlText};font:500 13px 'IBM Plex Mono',monospace;padding:5px 60px;border-radius:7px">readme.prime0x2.dev</div>
    </div>
    <img src="${src}" style="display:block;width:100%">
  </div>`;
}

async function render(html, width, height, file) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.setContent(
    `<!doctype html><html><head>${FONTS}<style>*{box-sizing:border-box}body{margin:0;width:${width}px;height:${height}px;overflow:hidden;font-family:'IBM Plex Sans',sans-serif}</style></head><body>${html}</body></html>`,
    {
      waitUntil: "networkidle0",
    },
  );
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png" });
  writeFileSync(join(OUT, file), png);
  console.log(`wrote .github/assets/${file} (${Math.round(png.length / 1024)} KB)`);
  await page.close();
}

const light = await appShot("light");
const dark = await appShot("dark");

const BG = `background:
  radial-gradient(circle at 15% 0%, rgba(255,255,255,.22), transparent 45%),
  radial-gradient(circle at 100% 100%, rgba(120,30,0,.35), transparent 50%),
  radial-gradient(rgba(255,255,255,.10) 1px, transparent 1.4px) 0 0/22px 22px,
  linear-gradient(135deg, #f5721a, #bf440e)`;

// ── Cover ───────────────────────────────────────────────────────────
const pill = (t) =>
  `<span style="padding:7px 16px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);color:#fff;font-weight:500;font-size:16px">${t}</span>`;
await render(
  `<div style="position:relative;width:1280px;height:640px;${BG};display:flex;flex-direction:column;align-items:center">
    <div style="display:flex;align-items:center;gap:18px;margin-top:52px">
      <span style="width:62px;height:62px;border-radius:15px;background:#fff;color:#e65a0f;padding:9px;box-shadow:0 8px 24px rgba(80,20,0,.25)">${BOOK}</span>
      <span style="font-family:Fraunces,serif;font-weight:600;font-size:60px;letter-spacing:-.02em;color:#fff">Readme<em style="font-style:italic">Studio</em></span>
    </div>
    <p style="margin:14px 0 0;color:rgba(255,255,255,.92);font-size:23px">The README editor with exports that don't suck.</p>
    <div style="display:flex;gap:10px;margin-top:22px">
      ${["GitHub-accurate preview", "PDF", "DOCX", "Mermaid", "Share links", "No backend"].map(pill).join("")}
    </div>
    <div style="position:absolute;top:262px;left:50%;transform:translateX(-50%)">
      ${windowFrame(dataUrl(light.png), { width: 1080 })}
    </div>
  </div>`,
  1280,
  640,
  "cover.png",
);

// ── Dark-mode card ──────────────────────────────────────────────────
await render(
  `<div style="width:1280px;height:800px;background:radial-gradient(circle at 20% 0%, #44403c, transparent 55%),#1c1917;display:flex;align-items:center;justify-content:center">
    ${windowFrame(dataUrl(dark.png), { dark: true, width: 1160 })}
  </div>`,
  1280,
  800,
  "dark-mode.png",
);

// ── PDF card: page 1 of the real export ─────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), "rs-readme-"));
writeFileSync(join(tmp, "doc.pdf"), light.pdf);
execFileSync("pdftoppm", [
  "-r",
  "200",
  "-png",
  "-f",
  "1",
  "-l",
  "1",
  "-singlefile",
  join(tmp, "doc.pdf"),
  join(tmp, "page"),
]);
const pagePng = readFileSync(join(tmp, "page.png"));
await render(
  `<div style="width:1280px;height:800px;background:radial-gradient(circle at 80% 0%, #fde3cc, transparent 60%),#f5f0ea;display:flex;align-items:center;justify-content:center;gap:56px">
    <div style="width:420px;color:#1c1917">
      <div style="font:500 14px 'IBM Plex Mono',monospace;color:#bf440e;letter-spacing:.08em">PDF EXPORT</div>
      <div style="font-family:Fraunces,serif;font-weight:600;font-size:40px;line-height:1.15;margin-top:12px">Printed by the browser, from the preview's own CSS.</div>
      <p style="font-size:18px;line-height:1.6;color:#57534e;margin-top:18px">Vector text, working links, diagrams as SVG, page numbers and smart page breaks. Never a blurry screenshot.</p>
    </div>
    <img src="${dataUrl(pagePng)}" style="height:720px;border-radius:4px;box-shadow:0 24px 60px -12px rgba(60,30,10,.35),0 0 0 1px rgba(0,0,0,.06)">
  </div>`,
  1280,
  800,
  "pdf-export.png",
);

await browser.close();
