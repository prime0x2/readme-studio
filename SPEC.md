# ReadmeStudio — Product & Technical Specification

> A readme.so-style README editor with first-class, high-fidelity **PDF** and **DOCX** export, built as a pnpm monorepo (React SPA + Node export API), deployed to a personal VPS via nginx + PM2.
>
> readme.so is MIT-licensed open source (<https://github.com/octokatherine/readme.so>); we adopt its interaction model and port its section templates with attribution.


> **Architecture update:** the export API described below (Hono + pooled Chromium, §2, §6–7, §12) has been removed. ReadmeStudio is now a static site: PDF is printed by the browser's own engine from the same preview HTML/CSS, and DOCX is built in the browser (`src/lib/printPdf.ts`, `src/lib/docx/`). The rendering and styling requirements in this spec still apply; the server-side mechanics are historical.
>
> **Layout update:** the monorepo has since been collapsed into a single Vite app: `apps/web` → the repo root (`src/`, `tests/`), `packages/shared` → `src/shared/`, and turbo is gone. Paths below refer to the old layout.

---

## 1. Product Overview

ReadmeStudio lets users compose a README from a library of pre-written, reorderable **sections**, see a live GitHub-style preview, and download the result as:

1. **Markdown** (`README.md`) — raw file, client-side.
2. **PDF** — rendered server-side by headless Chromium from the *exact same HTML + CSS as the preview*: vector text, clickable links, syntax-highlighted code, smart page breaks. Never rasterized.
3. **DOCX** — generated from the markdown AST with the `docx` library: real Word heading styles, GitHub-like typography, highlighted code, tables, task lists, embedded images/badges.

A **share-by-link** feature (read-only snapshots with a fixed TTL) is planned but **not** part of v1 — it is specified in §10 and documented in the README roadmap.

### Non-goals for v1

- Accounts / auth / cloud persistence (localStorage only).
- Real-time collaboration.
- Mobile-first phone layout (usable-but-cramped is acceptable; see §5.6).
- Playwright e2e tests (explicitly deferred to a later release; see §11).

---

## 2. Architecture

```
┌────────────────────────┐         ┌──────────────────────────────┐
│  apps/web (Vite SPA)   │  POST   │  apps/api (Hono on Node)     │
│  React 19 + TS         │ ───────▶│  /api/v1/export/pdf          │
│  Tailwind v4 + Zustand │  md +   │  /api/v1/export/docx         │
│  CodeMirror 6          │  title  │  warm pooled Chromium        │
│  localStorage persist  │◀─────── │  (Puppeteer) + docx builder  │
└────────────────────────┘  file   └──────────────────────────────┘
            │                              │
            └────────── packages/shared ───┘
        markdown pipeline config · preview CSS (github-light/dark)
        section template definitions · shared types
```

**Why a server from day one:** the PDF quality bar ("exactly like the preview") rules out client-side raster libraries; headless Chromium printing the real preview HTML is the only approach that delivers it. The future share feature needs the same server.

### 2.1 Repository layout (pnpm workspaces)

```
readmestudio/
├── apps/
│   ├── web/                  # Vite + React SPA
│   └── api/                  # Hono export API
├── packages/
│   └── shared/               # markdown pipeline, preview CSS, templates, types
├── scripts/
│   ├── deploy.sh             # VPS deploy (dev|prod) — see §12.2
│   └── (redeploy.sh later)
├── dev_setup.sh              # idempotent local bootstrap — see §12.1
├── pnpm-workspace.yaml
├── turbo.json                # build/dev/lint/test pipelines (matches existing projects)
├── biome.json                # lint + format (no ESLint/Prettier)
├── .husky/                   # pre-commit: biome check, typecheck
├── .nvmrc                    # Node 24
├── .editorconfig
├── README.md
└── SPEC.md
```

The current flat Vite template is restructured into `apps/web`. **Turborepo** is included because the team already uses it (mern-boilerplate) and it gives cached `build`/`lint`/`test` across the three packages; config stays minimal.

### 2.2 packages/shared — the single source of truth

The defining constraint of this project: **preview and PDF must render identically**. Therefore everything that affects rendering lives in `packages/shared` and is consumed by both apps:

- `markdown.ts` — the unified pipeline factory (same plugins, same options, used by web preview and API PDF renderer).
- `preview.css` — GitHub-flavored document styling (light + dark variants; exports always use light, see §6.3) **plus** the `@media print` / paged-media rules for PDF page breaks.
- `templates/` — section template definitions (§4.2).
- `types.ts` — `Section`, `ExportRequest`, etc.

Any styling change to the preview automatically applies to PDFs. There is deliberately **no second styling system to drift**.

---

## 3. Markdown Pipeline

Single unified pipeline (in `packages/shared`), used everywhere:

| Stage | Plugin | Notes |
|---|---|---|
| Parse | `remark-parse` + `remark-gfm` | tables, task lists, strikethrough, autolinks |
| Emoji | `remark-gemoji` | `:rocket:` → 🚀 |
| To HTML | `remark-rehype` (`allowDangerousHtml`) + `rehype-raw` | inline HTML support (`<img>`, `<p align>`, `<details>`…) |
| Sanitize | `rehype-sanitize` (extended GitHub schema) | allow `align`, `width`, `details/summary`; strip scripts/handlers |
| Highlight | **Shiki** (`github-light` / `github-dark` themes) | one highlighter for preview, PDF, **and** DOCX (token API) |
| Stringify | `rehype-stringify` | |

**Why Shiki:** its `codeToTokens` API yields per-token colors, which is exactly what the DOCX builder needs to emit colored text runs — preview, PDF, and DOCX share one highlighting source so code looks consistent across all three.

Supported feature matrix (all must survive into every format):

| Feature | Preview/PDF | DOCX |
|---|---|---|
| Core GFM (tables, task lists, strikethrough, autolinks) | ✅ | ✅ |
| Fenced code + syntax highlighting | ✅ Shiki HTML | ✅ Shiki tokens → colored runs |
| Inline HTML (`<img>`, `<p align>`, `<details>`) | ✅ | ✅ images + alignment; `<details>` rendered expanded |
| Badges (shields.io SVG) | ✅ | ✅ fetched server-side, SVG → PNG via `@resvg/resvg-js` |
| Emoji shortcodes | ✅ | ✅ Unicode text (system font fallback accepted) |

---

## 4. Editor (apps/web)

### 4.1 Interaction model — full readme.so section system

Three-column layout: **Sections sidebar · Editor · Preview**.

- **Sidebar**: searchable list of section templates; click to add to the document; added sections shown in document order; **drag to reorder** (`dnd-kit`); per-section actions: delete (→ trash), **reset to template default**.
- **Trash / restore**: deleted sections collect in a collapsed "Deleted sections" area in the sidebar and can be restored with content intact (readme.so behavior). Trash is persisted.
- **Custom section**: an "add custom section" entry creates a blank section with a user-named heading.
- **Selecting** a section loads it into the editor; the corresponding block is softly highlighted in the preview and scrolled into view.
- **Document = concatenation** of section markdown in sidebar order, joined by blank lines.

### 4.2 Section templates

Port readme.so's MIT-licensed English template set (same slugs and default content, with attribution in README), **then improve**:

- Modernize wording/structure of existing templates where dated.
- Add new templates: **Docker**, **Badges block** (CI/license/version), **Monorepo layout**, **Configuration / .env reference**, **Self-hosting**, **Security policy**.

Template shape: `{ slug, name, markdown }` in `packages/shared/templates/`. New-user default document: `title-and-description` pre-added (readme.so behavior).

### 4.3 Editing surface — CodeMirror 6

- Markdown syntax highlighting, list/blockquote continuation, bracket matching.
- Shortcuts: **Cmd/Ctrl+B** bold, **Cmd/Ctrl+I** italic, **Cmd/Ctrl+K** link wrap.
- Per-section CodeMirror **history** (text undo/redo scoped to the section).

### 4.4 Undo model — two-level (no global undo stack)

- **Text**: Cmd+Z inside the editor = CodeMirror history, per section.
- **Structure**: no Cmd+Z. Explicit affordances instead — *Reset section* (back to template default, with confirm), *trash restore* for deletes, drag again for reorders. This avoids the "Cmd+Z made my section disappear" failure mode.

### 4.5 Preview pane

- Tabs: **Preview** (rendered, GitHub-style via `preview.css`) and **Raw** (generated markdown, read-only, copy button).
- Preview theme toggle (github-light / github-dark) — affects **preview only**, never exports.
- Rendering is debounced (~150 ms) off the document state.

### 4.6 State & persistence (Zustand + localStorage)

```ts
interface Section { id: string; slug: string; name: string; markdown: string; isCustom: boolean }
interface DocState {
  sections: Section[];        // document order
  trash: Section[];
  selectedId: string | null;
  previewTheme: 'light' | 'dark';
  uiTheme: 'light' | 'dark' | 'system';
}
```

- Single document, auto-persisted to `localStorage` (`readmestudio:doc:v1`, versioned key for future migrations) via Zustand `persist` middleware on every change.
- Multi-document management is **out of scope** for v1 (rides along with the share feature later).

---

## 5. App UI / UX

### 5.1 Visual identity

**Own polished design** — keep readme.so's three-column interaction model, but original branding, palette, and typography (no near-pixel clone). Built with Tailwind v4 for app chrome; the preview pane uses the standalone `preview.css` (not Tailwind) so it can be shared with the PDF renderer verbatim.

### 5.2 Top bar

Logo/name · document title (from first H1, used for export filenames) · UI theme toggle · **Download ▾** group: `README.md` · `PDF` · `DOCX` · reset-document action (confirm dialog).

### 5.3 Export UX contract

- `.md` downloads instantly, client-side.
- PDF/DOCX: clicked button shows an **inline spinner** (button disabled, others remain usable); file downloads on success.
- **No options dialog** — opinionated defaults (A4, light theme, filename from document title, slugified, fallback `readme`): `my-project.pdf`, `my-project.docx`.
- Failure → **toast** with a human message and a **Retry** action. Timeout client-side at 30 s.
- Markdown over the 1 MB request cap → toast explaining the limit before any request is made.

### 5.4 Theming

Proper **dark mode for the app UI** (`light`/`dark`/`system`, persisted). Exports are unaffected (§6.3).

### 5.5 Empty/edge states

- No sections: friendly empty state with a "start with Title + Description" CTA.
- localStorage unavailable (private mode): banner warning that work won't persist.

### 5.6 Responsiveness

Desktop-first (optimized ≥1024 px). Tablet: collapsible sections sidebar + editor/preview tab toggle. Phones: functional but cramped is acceptable; no dedicated phone layout in v1.

---

## 6. PDF Export (apps/api)

### 6.1 Endpoint

`POST /api/v1/export/pdf` — body `{ markdown: string, title?: string }` (≤1 MB) → `application/pdf` with `Content-Disposition: attachment`.

Pipeline: shared markdown pipeline → full HTML document embedding `preview.css` (light) → warm Chromium page → `page.pdf()`.

### 6.2 Rendering quality bar

- **Vector, selectable text**; clickable hyperlinks preserved.
- **A4**, margins ≈ 18 mm, `printBackground: true`.
- **Smart page breaks** via CSS in the shared stylesheet:
  - headings: `break-after: avoid` (never orphaned at page bottom);
  - table rows, images, blockquotes: `break-inside: avoid`;
  - long code blocks **may split** across pages with background/border continuing cleanly;
  - tables repeat `<thead>` on continuation pages.
- Subtle page numbers in the footer (`page.pdf` footer template); no header.
- Shiki-highlighted code identical to the preview.

### 6.3 Theme policy

**Exports always render light** (github-light), regardless of the user's preview/app theme. Documents are for reading and printing; this is a deliberate, documented exception to literal WYSIWYG.

### 6.4 Chromium management & hardening

- **One warm browser** (Puppeteer-managed Chromium), launched at API boot, auto-relaunched on crash.
- **Page pool** with a concurrency cap (default 3) and a FIFO queue; per-render timeout 15 s → 504 with a clean error body.
- Rendered pages: **JavaScript disabled**; request interception allows only `document` (our generated HTML) and **images**; image fetches block private/loopback IP ranges (SSRF guard); 5 s per-resource timeout, missing images degrade to alt text.
- Periodic page recycling (every N renders) to keep memory bounded (~expect 300–500 MB steady-state).

---

## 7. DOCX Export (apps/api)

### 7.1 Endpoint

`POST /api/v1/export/docx` — same request shape/limits → `.docx` (`Content-Disposition: attachment`).

Pipeline: markdown → **mdast** (same remark parse stage) → node-by-node mapping to `docx` library elements.

### 7.2 Fidelity contract

DOCX cannot be pixel-identical to HTML; the contract is **faithful structural mapping with matching typography** — fonts, sizes, and colors tuned to mirror the GitHub-light preview.

| Markdown node | Word output |
|---|---|
| Headings 1–6 | **Real Word styles** `Heading 1–6` (navigation pane + TOC work), sized/colored to match preview; H1/H2 bottom border via paragraph border |
| Paragraph / emphasis / strong / strikethrough / inline code | Runs; inline code in mono font with light-gray shading |
| Fenced code | Single-cell shaded table (light-gray bg, mono font), **Shiki tokens → colored runs** (github-light), preserved line breaks |
| Tables | Word tables, GitHub-like borders, bold shaded header row |
| Task lists | ☐ / ☒ glyph + text, indent preserved |
| Ordered/unordered lists | Native numbering/bullets, nested levels |
| Blockquote | Indented paragraph with left border + muted text |
| Links | Real hyperlinks (blue, underlined) |
| Images & badges | Fetched **server-side** (same SSRF guard as §6.4); **SVG rasterized to PNG** via `@resvg/resvg-js` (2× scale); sized to natural dimensions capped at content width; `<p align="center">` → centered paragraph |
| `<details>` | Rendered expanded: summary as bold paragraph + content |
| Thematic break | Horizontal rule paragraph |
| Emoji | Unicode text runs |

Document defaults: A4, ~2 cm margins, sans body font (e.g. Calibri/Inter), mono code font (Consolas), metadata title from request.

---

## 8. API Service (apps/api)

- **Hono** on Node 24. Routes: the two export endpoints + `GET /healthz` (also reports browser pool status).
- JSON body limit 1 MB; **rate limit** per IP (e.g. 10 exports/min) → 429.
- Structured request logging (pino), no markdown content in logs.
- Errors: consistent `{ error: { code, message } }`; never leak stack traces.
- CORS: allow configured frontend origins only.
- Config via env: `PORT`, `CORS_ORIGINS`, `EXPORT_CONCURRENCY`, `RATE_LIMIT_*` (`.env.example` provided).

---

## 9. Frontend Stack Summary (apps/web)

| Concern | Choice |
|---|---|
| Build | Vite + React 19 + TypeScript |
| Styling | Tailwind v4 (app chrome) + shared `preview.css` (document) |
| State | Zustand + `persist` (localStorage) |
| Editor | CodeMirror 6 (`@codemirror/lang-markdown`) |
| Drag & drop | dnd-kit |
| Markdown render | shared unified pipeline + Shiki |
| Toasts | sonner (or equivalent lightweight) |
| API base | `VITE_API_BASE_URL` |

---

## 10. Future Feature — Share by Link (specified now, built later)

> Documented in README roadmap; **not** implemented in v1. The v1 architecture (Node API on the VPS) is deliberately ready for it.

**Semantics — read-only snapshot.** Sharing freezes the document at that moment and returns a link. The link opens a server-rendered read-only page (same `preview.css`) with **Download MD / PDF / DOCX** and **Clone to my editor** (loads the snapshot into the visitor's localStorage doc, with overwrite confirm). Snapshots are immutable; re-sharing creates a new link.

**Retention.** Creator picks TTL at share time: **1 / 7 / 30 days (default 7)** — hard cap, no extension. Expired snapshots are purged by a scheduled job (node-cron in the API or PM2 cron) and return a friendly 410 page.

**Data model & storage.** SQLite (`better-sqlite3`) on the VPS — zero extra infrastructure:

```
shares(id TEXT PK,            -- nanoid(12), unguessable
       markdown TEXT,         -- ≤ 1 MB
       title TEXT,
       created_at INTEGER,
       expires_at INTEGER)    -- indexed for purge
```

**API.** `POST /api/v1/share {markdown, title, ttlDays}` → `{ url, expiresAt }` · `GET /s/:id` (rendered page) · `GET /api/v1/share/:id` (raw, for clone).

**Abuse posture.** No accounts. Rate-limited creation per IP; 1 MB size cap; sanitized rendering (same pipeline); `noindex` on shared pages; IDs unguessable. *Later hardening candidates:* private deletion URL returned at creation, `/report` takedown endpoint.

---

## 11. Testing (v1: targeted; e2e deferred)

**Vitest** unit/snapshot tests on the fragile, silently-regressing surfaces:

1. **markdown → DOCX mapping** — one test per node type (headings, tables, task lists, nested lists, code with highlighting, links, images, blockquotes, HTML alignment): assert the generated docx structure (styles, runs, colors), not bytes.
2. **Section store** — add/delete/restore/reorder/reset, persistence round-trip, localStorage schema versioning.
3. **Export fixtures** — a corpus of representative READMEs (kitchen-sink GFM, badge-heavy, CJK/emoji, 100-page stress doc): markdown → HTML snapshot tests; PDF endpoint renders without error and yields a parseable PDF with expected page count range.
4. **API contract** — limits (413), rate limit (429), timeout (504), malformed body (400).

**Deferred to a later release (tracked in README roadmap):** Playwright e2e — edit sections → download each format → validate files open and contain expected text.

CI (GitHub Actions): biome check → typecheck → vitest, on every push. Image/deploy automation is not in v1 CI.

---

## 12. Local Setup & VPS Deployment

### 12.1 `dev_setup.sh` (modeled on mern-boilerplate)

Idempotent bootstrap, safe to re-run, never overwrites existing config:

1. Verify Node from `.nvmrc` (Node 24), installing via nvm if missing.
2. Verify pnpm (enable via corepack if missing).
3. `copy_if_missing` for `apps/api/.env.example → .env.development`, `apps/web/.env.example → .env.development`, `.vscode/*.example.json`.
4. `pnpm install`.
5. Build `packages/shared` so both apps type-check.
6. Print next steps (`pnpm dev` → web :3000, api :8080).

### 12.2 `scripts/deploy.sh` (modeled on braeleni)

`./scripts/deploy.sh <dev|prod>` against the personal VPS — nginx + PM2, **no Docker** (matches existing infrastructure; Docker noted as future option):

- Env case block with **easily-editable placeholder values** at the top:
  - dev: `rs-dev.portfoliobucket.shop`, API port `6980`, PM2 `rs-api-dev`, branch `dev`
  - prod: `readmestudio.portfoliobucket.shop`, API port `6981`, PM2 `rs-api-prod`, branch `main`
- Prereq checks: node ≥ 24, pnpm, nginx, pm2.
- `pnpm install` → write `.env` files (web `VITE_API_BASE_URL=https://$DOMAIN/api/v1`; api port/CORS) → `pnpm build`.
- nginx site: static root = `apps/web/dist`, SPA `try_files`, `/api` → `127.0.0.1:$API_PORT` proxy (and later `/s/` for shared pages); `nginx -t` gate before reload.
- PM2 start of `apps/api/dist/index.js` + `pm2 save`.
- Numbered `[n/N]` step echoes and a summary block, same style as braeleni.

**Chromium on the VPS:** Puppeteer downloads its own Chromium at `pnpm install`; deploy.sh additionally installs the distro shared-library dependencies (Debian/Ubuntu `apt` list) on first run and verifies launch via a post-deploy `GET /healthz` check.

### 12.3 Tooling baseline

Biome (lint + format, replacing the template's ESLint) · husky pre-commit (`biome check`, typecheck) · `.nvmrc` = 24 · `.editorconfig` · turbo pipelines for `dev`/`build`/`lint`/`test`.

---

## 13. Milestones

| # | Milestone | Contents |
|---|---|---|
| M1 | Monorepo foundation | pnpm workspaces + turbo + Biome/husky restructure; `packages/shared` with pipeline + templates + preview.css; `dev_setup.sh` |
| M2 | Editor core | Section sidebar (add/search/reorder/delete/restore/reset), CodeMirror, live preview + raw tab, localStorage persistence, dark mode, top bar, `.md` download |
| M3 | PDF export | Hono API, warm Chromium pool, print CSS / smart breaks, export UX (spinner/toast/retry), hardening (limits, SSRF guard, rate limit) |
| M4 | DOCX export | mdast → docx mapping incl. Shiki runs + badge rasterization; fixture corpus |
| M5 | Tests & polish | Vitest suites (§11), CI workflow, empty/edge states, tablet responsiveness |
| M6 | Deploy | `scripts/deploy.sh`, VPS dev + prod live, healthcheck |
| — | Post-v1 | Share-by-link (§10), Playwright e2e, import-.md-to-sections, multi-document |

---

## 14. Key Decisions Log (from spec interview, 2026-06-11)

| Decision | Choice | Rejected alternatives |
|---|---|---|
| PDF engine | Server-side headless Chromium, warm pool | jsPDF/html2canvas (raster), window.print (dialog UX), paged.js (style drift) |
| DOCX engine | mdast → `docx` lib, Shiki token runs | pandoc (binary dep, template-driven styling), html-to-docx (quality ceiling) |
| Architecture | SPA + Hono API from day one | client-only (PDF bar unreachable), serverless (Chromium cold starts) |
| Editor model | Full readme.so section system | hybrid raw-mode (sync complexity), plain split-pane |
| Pagination | Smart A4 breaks | continuous page, user-configurable dialog |
| Export theme | Always light | match preview theme, ask at export |
| Markdown scope | GFM + Shiki highlighting + inline HTML/badges + emoji | — |
| Editor input | CodeMirror 6 | bare textarea, textarea+toolbar |
| Persistence | Single doc, localStorage | multi-doc, .md import (post-v1) |
| Export UX | Inline spinner + toast retry, no dialog | options modal, print-fallback degradation |
| Visual design | Own design, readme.so layout model | pixel clone |
| Templates | Port readme.so set (MIT, attributed) + improve/add | clean-room originals |
| Share model (future) | Read-only snapshot, clone-to-editor | gist-style updates, live collab |
| Share TTL (future) | User-picked 1/7/30 d (default 7), hard cap, purge job, no accounts | single fixed TTL |
| Repo | pnpm workspaces + turbo, Hono | npm workspaces, Express, flat server/ folder |
| Deployment | VPS nginx + PM2 via deploy.sh (placeholder domains) | Docker images, serverless |
| Testing | Targeted Vitest (converters/store/fixtures); e2e later | full pyramid now, smoke-only |
| Tooling | Biome + husky + .nvmrc 24 | ESLint + Prettier |
| Responsive/theme | Desktop-first + tablet; app dark mode | full mobile, light-only |
| Undo | Two-level (CM history + reset/trash) | global undo stack |
| Name | **ReadmeStudio** | — |
