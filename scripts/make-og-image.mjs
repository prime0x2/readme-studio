// One-off: rasterize the social-share (Open Graph) card to public/og.png.
// Run with: node scripts/make-og-image.mjs   (renders with Puppeteer's Chromium)
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OG_OUT ?? resolve(here, "../public/og.png");

// 1200×630 is the canonical Open Graph card size.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f5721a"/>
      <stop offset="1" stop-color="#bf440e"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <!-- subtle paper card -->
  <rect x="72" y="86" width="1056" height="458" rx="28" fill="#faf9f7"/>

  <!-- brand book glyph (from favicon) -->
  <g transform="translate(132 150) scale(3.2)">
    <rect width="32" height="32" rx="7" fill="#e65a0f"/>
    <path d="M16 9.5c-1.8-1.4-4.2-1.9-6.5-1.6v13.4c2.3-.3 4.7.2 6.5 1.6 1.8-1.4 4.2-1.9 6.5-1.6V7.9c-2.3-.3-4.7.2-6.5 1.6Z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M16 9.5v13.4" stroke="#fff" stroke-width="1.8"/>
  </g>

  <text x="270" y="232" font-family="Helvetica, Arial, sans-serif" font-size="68" font-weight="700" fill="#16130f">ReadmeStudio</text>
  <text x="272" y="296" font-family="Helvetica, Arial, sans-serif" font-size="31" font-weight="400" fill="#57534e">README &amp; Markdown editor with real PDF &amp; DOCX export</text>

  <!-- format pills -->
  <g font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="600">
    <rect x="132" y="392" width="170" height="74" rx="37" fill="#fdead7"/>
    <text x="217" y="440" fill="#bf440e" text-anchor="middle">PDF</text>
    <rect x="320" y="392" width="200" height="74" rx="37" fill="#fdead7"/>
    <text x="420" y="440" fill="#bf440e" text-anchor="middle">DOCX</text>
    <rect x="538" y="392" width="290" height="74" rx="37" fill="#fdead7"/>
    <text x="683" y="440" fill="#bf440e" text-anchor="middle">Markdown</text>
  </g>

  <text x="132" y="512" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="500" fill="#78716c">readme.prime0x2.dev  ·  free  ·  no signup</text>
</svg>`;

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630 });
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
await page.setContent(
  `<body style="margin:0"><img id="card" src="${src}" width="1200" height="630"></body>`,
);
await page.waitForFunction(() => document.getElementById("card")?.complete);
const card = await page.$("#card");
const png = await card.screenshot({ type: "png" });
await browser.close();
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
