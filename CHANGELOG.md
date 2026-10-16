# Changelog

All notable changes to ReadmeStudio. Releases: <https://github.com/prime0x2/readme-studio/releases>

## [2.2.0](https://github.com/prime0x2/readme-studio/releases/tag/v2.2.0) — 2026-10-16

**Bring your README in, send it out nicely.** Open a Markdown file straight from your computer, and shared links now greet readers with a sealed-document password screen, then let them pick a theme and download the document as PDF, DOCX or Markdown.

### ✨ New

- **Open a Markdown file from your computer.** Click **Open file** in the top bar, or drop a `.md` file anywhere on the editor. It's split into sections like a GitHub import, and your current sections move to Deleted sections. Files over 1 MB or that aren't Markdown are refused with a clear message.
- **A new look for shared links' password screen.** The locked page now looks like the document it protects: a sheet with its lines blacked out and an orange seal. It shows when the link expires, has a show-password button, and reacts while unlocking and to a wrong password.
- **Theme toggle and downloads on shared links.** Whoever opens a password-protected link can now switch between light, dark and system themes, and download the document as PDF, DOCX or Markdown, all built in their browser.

### 🛠 Improved

- **The top bar fits on small phones.** Down to 360 px wide, every button stays on screen.
- **Share-link hardening.** Link lookups are rate-limited per client; the storage-cap check reads a small size column instead of every stored document; the build now fails if the share pages' security policy doesn't match the page that's actually served; and the password form is friendlier to screen readers and keyboards (errors are announced and linked to the field, and a wrong password is selected for retyping).

## [2.1.0](https://github.com/prime0x2/readme-studio/releases/tag/v2.1.0) — 2026-10-15

**Share without giving up privacy.** Send a README to anyone with a password-protected link that's encrypted before it leaves your browser. The editor also starts from a blank page now, and never leaves you without a section to type in.

### ✨ New

- **Password-protected share links.** Click **Share** in the editor, set a password and an expiry (1, 7 or 30 days) and get a short `/s/…` link. The document is encrypted in your browser before upload; the server stores only ciphertext and never sees the document or the password. Whoever opens the link types the password and sees just the document, full screen. Wrong passwords are rate-limited, and expired links are deleted daily.

### 🛠 Improved

- **Start from a blank page.** New documents open with one empty section instead of the Title and Description template; templates are still a click away in the sidebar. A blank section names itself after its first heading as you type.
- **The editor never runs out of sections.** Deleting the last section leaves a fresh blank one, so you can keep typing even with the sidebar hidden. Deleting a section now shows an **Undo** button.

### 📦 Under the hood

- Fixed all open Dependabot alerts: Mermaid 12.2 (which brings KaTeX 0.18), wrangler 4.151, and a patched `source-map-js` for the dev tooling.

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
