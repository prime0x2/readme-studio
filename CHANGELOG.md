# Changelog

All notable changes to ReadmeStudio. Releases: <https://github.com/prime0x2/readme-studio/releases>

## [2.0.0](https://github.com/prime0x2/readme-studio/releases/tag/v2.0.0) — 2026-09-27

**No servers, just the browser.** ReadmeStudio is now a fully client-side app. Editing, preview, PDF and DOCX export all run in your browser, so your README never leaves your machine. It's served from Cloudflare's edge at **<https://readme.prime0x2.dev>** and is now open source under the MIT license.

### ✨ New

- **Preview and share any GitHub README.** Open `/view?url=<github link>` for a read-only preview you can share, with PDF/DOCX download. It accepts a repo, a file on github.com, a `raw.githubusercontent.com` URL or a gist. `/gh/<owner>/<repo>` works as a short form, and `mode=full` gives a reading view without the editor controls. Relative images and links resolve against the repository, like they do on GitHub.
- **Edit a copy.** Turns any shared GitHub README into sections in the editor, ready to tweak and re-export.
- **Mermaid diagrams.** ` ```mermaid ` blocks render in the preview, export as vector SVG in the PDF and as crisp images in the DOCX. Invalid diagrams fall back to a normal code block.
- **Full screen.** Expands the preview to fill the window (Esc to exit).
- **Hide the sidebar.** Collapse the sections sidebar with the new button or **Ctrl/⌘ + \\**.

### 🛠 Improved

- **PDF export uses your browser's own print engine**, driven by the same HTML and CSS as the preview. Text stays sharp and selectable and links keep working. Pages are A4 with page numbers, headings don't get stranded at the bottom of a page, and tables and images aren't cut across pages. Choose *Save as PDF* in the print dialog and untick *Headers and footers*. Page numbers need Chrome or Edge.
- **DOCX export is built in the browser** and is much faster. Images from sites that block direct downloads are fetched through an image proxy ([wsrv.nl](https://wsrv.nl)), and only those images.
- **Bengali text** now renders correctly in PDF and DOCX exports, diagrams included.
- **Tables** in exports: long cells wrap to the page width, and DOCX column widths follow the real content and image sizes.
- **Top bar** stays on one line at every screen width and collapses to icons on small screens.

### 🐛 Fixed

- Mermaid `flowchart LR` diagrams and diagram labels in exports.
- Tables broken in PDF/DOCX exports.
- Contact icons and badges stacking vertically instead of sitting in a row.

### 📦 Under the hood

- **No backend.** The old Hono + Chromium export API is gone, along with the VPS, nginx and PM2 setup. The site is a static app served by Cloudflare Workers, with no server code.
- **Single Vite app.** The pnpm/Turborepo monorepo became one `pnpm create vite` project: `src/`, `src/shared/` and `tests/`.
- **Tests:** 135 tests, including headless-Chromium checks for Mermaid, printing and DOCX, plus side-by-side comparisons with GitHub's own rendering of real READMEs.
- **Tooling:** CI runs Biome, the build, a Cloudflare deploy dry run (`wrangler deploy --dry-run`) and all tests. Deploy with `pnpm run deploy`.
- **Security:** dependencies patched, and `pnpm audit` reports no known vulnerabilities.
- **License:** [MIT](https://github.com/prime0x2/readme-studio/blob/main/LICENSE).

### ⬆️ Upgrading from v1

Nothing to do. Your saved document lives in your browser's storage and loads as before on the same domain. The only visible change is PDF export: it now opens the print dialog instead of downloading a file directly.

The previous server-based version is preserved on the [`v1`](https://github.com/prime0x2/readme-studio/tree/v1) branch, and the client-only monorepo on [`v2`](https://github.com/prime0x2/readme-studio/tree/v2).
