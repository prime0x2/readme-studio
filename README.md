# ReadmeStudio

A [readme.so](https://readme.so)-style README editor with one big upgrade: **exports that don't suck**. Compose a README from reorderable section templates, watch a live GitHub-style preview, and download it as Markdown, **PDF**, or **DOCX** — all in the browser, with no server: the PDF is printed by the browser's own engine from the exact same HTML/CSS as the preview (vector text, clickable links, smart page breaks — never a blurry screenshot). The whole app is a static site.

> Full product & technical specification: [SPEC.md](./SPEC.md)

## Features

- **Section-based editing** — searchable library of section templates (ported and improved from readme.so's MIT-licensed set, with new ones like Docker, Badges, Monorepo layout). Click to add, drag to reorder, reset to default, restore from trash.
- **Live preview** — GitHub-flavored rendering (GFM tables, task lists, Shiki syntax highlighting, badges/inline HTML, `<picture>` dark/light images, `> [!NOTE]`-style alerts, emoji shortcodes) with light/dark preview themes and a raw-markdown tab.
- **Mermaid diagrams** — ` ```mermaid ` blocks (flowcharts, sequence diagrams, …) render in the preview and export as vector SVG in the PDF and crisp images in the DOCX. Invalid diagrams fall back to a code block.
- **Preview & share any GitHub README** — open `/view?url=<github link>` (a repo, a file on github.com, a raw.githubusercontent.com URL, or a gist; `/gh/<owner>/<repo>` works too) for a shareable, read-only preview with PDF/DOCX export. Add `mode=full` for a chrome-free reading view. Relative images and links resolve against the repository, like on GitHub. **Edit a copy** splits it into sections in the editor.
- **Focus tools** — collapse the sections sidebar (Ctrl/⌘+\\) and a full-screen preview (Esc to exit).
- **CodeMirror 6 editor** — markdown highlighting, list continuation, Cmd+B/I/K shortcuts, per-section undo history.
- **Download `README.md`** — instant, client-side.
- **PDF** — opens the browser's print dialog on the document alone (choose *Save as PDF*, and untick *Headers and footers*). It's the same engine headless-Chrome PDF services use, driven by the preview's own stylesheet: A4, page numbers, smart page breaks (headings never orphaned, tables/images kept intact, code blocks split cleanly), wide tables wrapped to the page, selectable text, working hyperlinks, diagrams as vectors. Page numbers need Chrome/Edge (other browsers print without them).
- **DOCX** — built in the browser from the markdown AST: native Heading styles (navigation pane works), GitHub-like tables sized from real image widths, syntax-highlighted code, alerts, diagrams and badges as crisp 2x images. Images whose host blocks cross-origin reads (CORS) are fetched through an image proxy — [wsrv.nl](https://wsrv.nl) by default, only for those images, and configurable or switched off with `VITE_IMAGE_PROXY`.
- **Auto-save** — your document persists in localStorage as you type.

## Architecture

A single Vite app — a static SPA with no backend:

```
src/              Vite + React 19 + Tailwind v4 + Zustand: editor, share links,
                  PDF (print) and DOCX export
src/shared/       markdown pipeline, preview CSS, section templates, types
                  (single source of truth so preview and PDF can never drift)
tests/            Vitest suites, including headless-Chromium browser tests
```

## Getting started

Requires Node ≥ 22.13 (development uses 24 via `.nvmrc`) and pnpm ≥ 10 —
pnpm auto-switches to the exact version pinned in `package.json`.

```bash
./dev_setup.sh   # idempotent: checks node/pnpm, copies .env example, installs
pnpm dev         # the app on http://localhost:3000
```

Lint/format with Biome (`pnpm lint`), tests with Vitest (`pnpm test`).

### GitHub parity fixtures

`tests/github-parity/` checks that READMEs *look* like they do on GitHub. Each
`fixtures/<name>.md` is rendered twice in headless Chromium: GitHub's own HTML for it
(`<name>.github.html`, from GitHub's Markdown API, styled with `github-markdown-css`) and
our pipeline with the app's real CSS bundle, Tailwind reset included. The test compares
which images are shown, every image's size, float, alignment and which images share a
line, plus table shapes. Text isn't compared, since fonts legitimately differ. Images point
at `https://img.readmestudio.test/<w>x<h>/<name>.svg` and are generated at that size by
the test, so it runs offline.

Every fixture runs in light and dark. The GitHub side follows GitHub's theme, including
github.com's rule for `#gh-dark-mode-only` / `#gh-light-mode-only` links. Our side runs
with the viewer's OS preference set to the *opposite* theme, because the preview must
follow the app's theme toggle rather than the OS.

`tests/mermaid/` does the same for diagrams, which GitHub's API can't render: it runs the
preview's real Mermaid renderer in Chromium and checks that labels are visible, that
diagrams follow the theme, that invalid diagrams stay code, and that diagram labels can't
run script.

To add a case, write a new `fixtures/*.md` and fetch GitHub's rendering (set
`GITHUB_TOKEN` to lift the 60 requests/hour limit):

```bash
pnpm fixtures:update
```

## Deployment

Production lives at <https://readme.prime0x2.dev>, served by **Cloudflare
Workers** as an assets-only Worker: no server code, just `dist/` from
Cloudflare's edge (free plan). `wrangler.jsonc` holds the whole setup: the
assets directory, a single-page-app fallback (so `/view?url=…` and
`/gh/<owner>/<repo>` links load the app), and the custom domain.

**Automatic deploys (recommended).** In the Cloudflare dashboard: *Workers &
Pages → Create → Import a repository*, pick this repo, and set

- Build command: `pnpm build`
- Deploy command: `npx wrangler deploy`

Every push to `main` then builds and deploys; other branches get preview
URLs. CI (`.github/workflows/ci.yml`) also runs `wrangler deploy --dry-run`,
so a broken config fails the PR, not the deploy.

**Manual deploy.** `pnpm run deploy` (builds, then `wrangler deploy`; the
first run opens a browser to log in to Cloudflare). `pnpm run preview` serves
the production build locally in Cloudflare's runtime (`wrangler dev`).

**Custom domain.** The zone (`prime0x2.dev`) must be on the same Cloudflare
account, and `readme.prime0x2.dev` must not already have a DNS record:
delete the old record that pointed at the VPS before the first deploy —
Wrangler creates the domain's record itself. To host under a different
domain, change `routes` in `wrangler.jsonc` (or remove it and use the
`*.workers.dev` URL).

**Visitor analytics.** The site ships [Cloudflare Web
Analytics](https://developers.cloudflare.com/web-analytics/) — a cookie-less JS
beacon that counts real human page views (bots/crawlers that don't run JS are
excluded). Its token is public (it ships in the page source), so it's set in
the committed `.env.production`; only production builds load it.

## Roadmap

### Next release

- **Playwright e2e tests** — full flows: edit sections → download each format → validate file contents (v1 ships targeted Vitest suites for the DOCX mapping, section store, and export fixtures).

### Planned: Share a draft by link

READMEs already on GitHub can be shared today (`/view?url=…`, see Features). For drafts that aren't pushed anywhere yet, the plan fits the static architecture: put the document in the link itself — compressed markdown in the URL fragment (`/s#…`), which never reaches any server. The link opens the same read-only view as `/view`, with MD/PDF/DOCX download and **Edit a copy**. No storage, no expiry to manage; the practical limit is URL length (comfortably tens of KB of compressed markdown).

(An earlier design stored snapshots in SQLite on the API server — see [SPEC.md, section 10](./SPEC.md). The API is gone, so that design is superseded.)

### Ideas beyond that

- Import a local `README.md` file (GitHub links can already be imported via **Edit a copy**)
- Multiple documents with a document switcher
- More section template packs

## Credits

The section-editor interaction model and the original section template texts come from [readme.so](https://github.com/octokatherine/readme.so) by Katherine Oelsner (MIT License). ReadmeStudio is an independent project with its own design and export engine.
