/**
 * GitHub parity: render each fixture README twice in headless Chromium —
 * once as GitHub renders it (GitHub's own HTML from its Markdown API, with
 * github-markdown-css) and once through our pipeline with the app's real
 * CSS bundle (Tailwind reset included) — then compare the layout of every
 * image and table. Text isn't compared: fonts legitimately differ.
 *
 * Refresh the GitHub side with `pnpm fixtures:update`.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderMarkdown } from "@/shared";
import { type Bundle, buildBundle, interceptedPage, SITE } from "../browser-harness";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const IMAGES = "https://img.readmestudio.test";
/** Content width of the rendered article, like the preview at desktop size. */
const ARTICLE_WIDTH = 900;

let browser: Browser;
let bundle: Bundle;
let appCss: string;

beforeAll(async () => {
  // Only the app's stylesheet entry, bundled exactly as the app bundles it.
  bundle = await buildBundle({ styles: "src/styles.ts" });
  const [css] = bundle.css("styles");
  if (!css) throw new Error("the stylesheet build produced no CSS");
  appCss = css;
  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await bundle?.dispose();
});

/** A placeholder image of the size its URL names: /<w>x<h>/<label>.svg */
function placeholderSvg(url: URL): string | null {
  const match = url.pathname.match(/^\/(\d+)x(\d+)\//);
  if (!match) return null;
  const [, w, h] = match;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#8ab"/></svg>`;
}

function responder(pages: Record<string, string>) {
  return async (url: URL) => {
    if (url.origin === IMAGES) {
      const svg = placeholderSvg(url);
      return svg ? { body: svg, contentType: "image/svg+xml" } : null;
    }
    if (url.origin !== SITE) return null;
    const page = pages[url.pathname];
    if (page) return { body: page, contentType: "text/html" };
    const githubTheme = url.pathname.match(/^\/github-(light|dark)\.css$/)?.[1];
    if (githubTheme) {
      const css = await readFile(
        fileURLToPath(
          import.meta.resolve(`github-markdown-css/github-markdown-${githubTheme}.css`),
        ),
      );
      return { body: css, contentType: "text/css" };
    }
    return bundle.file(url.pathname);
  };
}

type Theme = "light" | "dark";

/**
 * The API's HTML differs from what github.com's README pages serve in one
 * way that matters for layout: it wraps the <img> inside <picture> in a
 * link, while README pages don't (checked on a live repo page). With the
 * wrapper, browsers ignore <source> entirely, so unwrap it.
 */
function asOnReadmePage(apiHtml: string): string {
  return apiHtml.replace(/<picture>[\s\S]*?<\/picture>/g, (picture) =>
    picture.replace(/<a\b[^>]*>(\s*<img\b[^>]*>\s*)<\/a>/g, "$1"),
  );
}

/**
 * github.com's own rule for github-readme-stats style images, verbatim
 * from its stylesheet (github-markdown-css doesn't include site rules).
 */
function githubModeOnlyRule(theme: Theme): string {
  const hidden = theme === "dark" ? "light" : "dark";
  return `<style>[href$="#gh-${hidden}-mode-only"] { display: none; }</style>`;
}

function documentHtml(stylesheet: string, articleAttrs: string, body: string, head = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${stylesheet}">${head}</head>
<body style="margin:0"><article class="markdown-body" ${articleAttrs}
  style="box-sizing:content-box;width:${ARTICLE_WIDTH}px;padding:0;margin:0">${body}</article></body></html>`;
}

interface ImageBox {
  src: string;
  width: number;
  height: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  float: string;
  /** Content box of the nearest non-inline ancestor. */
  blockLeft: number;
  blockRight: number;
  blockId: number;
}

interface TableShape {
  rows: number;
  columns: number;
  width: number;
}

interface Layout {
  images: ImageBox[];
  tables: TableShape[];
}

async function measure(
  path: string,
  pages: Record<string, string>,
  colorScheme: Theme,
): Promise<Layout> {
  const page = await interceptedPage(browser, responder(pages));
  try {
    await page.setViewport({ width: ARTICLE_WIDTH + 100, height: 800 });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: colorScheme }]);
    await page.goto(`${SITE}${path}`, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    return await page.evaluate(() => {
      const blocks = new Map<Element, number>();
      const visible = [...document.querySelectorAll(".markdown-body img")].filter((img) => {
        const r = img.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const images = visible.map((img) => {
        let block = img.parentElement as Element;
        while (block.parentElement && getComputedStyle(block).display.startsWith("inline")) {
          block = block.parentElement;
        }
        if (!blocks.has(block)) blocks.set(block, blocks.size);
        const style = getComputedStyle(block);
        const blockRect = block.getBoundingClientRect();
        const r = img.getBoundingClientRect();
        return {
          // the resource actually shown: <picture> may pick a <source>
          src: (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src,
          width: r.width,
          height: r.height,
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          float: getComputedStyle(img).float,
          blockLeft:
            blockRect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
          blockRight:
            blockRect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
          blockId: blocks.get(block) ?? -1,
        };
      });
      const tables = [...document.querySelectorAll(".markdown-body table")].map((table) => ({
        rows: table.querySelectorAll("tr").length,
        columns: Math.max(0, ...[...table.querySelectorAll("tr")].map((tr) => tr.children.length)),
        width: table.getBoundingClientRect().width,
      }));
      return { images, tables };
    });
  } finally {
    await page.close();
  }
}

/** Images laid out on the same line (overlapping vertically, same block). */
function lines(images: ImageBox[]): ImageBox[][] {
  const result: ImageBox[][] = [];
  for (const image of images) {
    const line = result.at(-1);
    const previous = line?.at(-1);
    const sameLine =
      previous &&
      image.float === "none" &&
      previous.float === "none" &&
      image.blockId === previous.blockId &&
      image.top < previous.bottom &&
      previous.top < image.bottom;
    if (line && sameLine) line.push(image);
    else result.push([image]);
  }
  return result;
}

function alignment(line: ImageBox[]): string {
  const first = line[0];
  const last = line.at(-1);
  if (!first || !last) return "none";
  const leftGap = first.left - first.blockLeft;
  const rightGap = first.blockRight - last.right;
  if (Math.abs(leftGap - rightGap) <= 3) return "center";
  if (leftGap <= 3) return "left";
  if (rightGap <= 3) return "right";
  return `offset ${Math.round(leftGap)}px`;
}

const name = (src: string) => src.replace(`${IMAGES}/`, "");
const px = (n: number) => Math.round(n * 10) / 10;

/** Human-readable differences between our layout and GitHub's. */
function compare(ours: Layout, github: Layout): string[] {
  const diffs: string[] = [];
  const shown = (layout: Layout) => layout.images.map((img) => name(img.src)).join(", ");
  if (shown(ours) !== shown(github)) {
    diffs.push(`images shown differ:\n    ours:   ${shown(ours)}\n    GitHub: ${shown(github)}`);
    return diffs;
  }
  github.images.forEach((expected, i) => {
    const actual = ours.images[i];
    if (!actual) return;
    const label = name(expected.src);
    if (
      Math.abs(actual.width - expected.width) > 1.5 ||
      Math.abs(actual.height - expected.height) > 1.5
    ) {
      diffs.push(
        `${label}: size ${px(actual.width)}×${px(actual.height)}, GitHub ${px(expected.width)}×${px(expected.height)}`,
      );
    }
    if (actual.float !== expected.float) {
      diffs.push(`${label}: float ${actual.float}, GitHub ${expected.float}`);
    }
  });

  const ourLines = lines(ours.images);
  const githubLines = lines(github.images);
  const shape = (ls: ImageBox[][]) => ls.map((l) => l.map((img) => name(img.src)).join(" + "));
  if (shape(ourLines).join(" | ") !== shape(githubLines).join(" | ")) {
    diffs.push(
      `line grouping differs:\n    ours:   ${shape(ourLines).join(" | ")}\n    GitHub: ${shape(githubLines).join(" | ")}`,
    );
  } else {
    githubLines.forEach((line, i) => {
      const ourLine = ourLines[i];
      if (!ourLine || line[0]?.float !== "none") return;
      const expected = alignment(line);
      const actual = alignment(ourLine);
      if (actual !== expected) {
        diffs.push(`${shape([line])[0]}: aligned ${actual}, GitHub ${expected}`);
      }
    });
  }

  if (ours.tables.length !== github.tables.length) {
    diffs.push(`table count: ours ${ours.tables.length}, GitHub ${github.tables.length}`);
  } else {
    github.tables.forEach((expected, i) => {
      const actual = ours.tables[i];
      if (!actual) return;
      if (actual.rows !== expected.rows || actual.columns !== expected.columns) {
        diffs.push(
          `table ${i + 1}: ${actual.rows}×${actual.columns}, GitHub ${expected.rows}×${expected.columns}`,
        );
      }
      // Fonts differ, so widths may too — but not by a collapsed-table margin.
      const ratio = actual.width / expected.width;
      if (ratio < 0.6 || ratio > 1.6) {
        diffs.push(`table ${i + 1}: width ${px(actual.width)}px, GitHub ${px(expected.width)}px`);
      }
    });
  }
  return diffs;
}

const fixtures = (await readdir(FIXTURES))
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.replace(/\.md$/, ""));

const cases = fixtures.flatMap((fixture) =>
  (["light", "dark"] as const).map((theme) => ({ fixture, theme })),
);

describe("GitHub parity (layout of images and tables)", () => {
  it.each(cases)(
    "$fixture ($theme) renders like GitHub",
    async ({ fixture, theme }) => {
      const markdown = await readFile(join(FIXTURES, `${fixture}.md`), "utf8");
      const githubHtml = await readFile(join(FIXTURES, `${fixture}.github.html`), "utf8");
      const pages = {
        "/ours": documentHtml(
          appCss,
          `data-theme="${theme}"`,
          await renderMarkdown(markdown, { theme }),
        ),
        "/github": documentHtml(
          `/github-${theme}.css`,
          "",
          asOnReadmePage(githubHtml),
          githubModeOnlyRule(theme),
        ),
      };
      const other: Theme = theme === "dark" ? "light" : "dark";
      const [ours, github] = [
        // Ours runs with the OS preference *opposite* to the app theme: the
        // preview must follow the app's theme toggle, not the viewer's OS.
        await measure("/ours", pages, other),
        // GitHub's <themed-picture> follows the site theme; emulate it via OS.
        await measure("/github", pages, theme),
      ];
      expect(github.images.length, "the GitHub rendering should contain images").toBeGreaterThan(0);
      expect(compare(ours, github)).toEqual([]);
    },
    60_000,
  );
});
