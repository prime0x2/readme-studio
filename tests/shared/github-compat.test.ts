import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/shared/markdown";
import { type DocumentBase, resolveDocumentUrl } from "@/shared/resolve-urls";

describe("GitHub alerts", () => {
  it("turns [!NOTE] blockquotes into titled alerts", async () => {
    const html = await renderMarkdown("> [!NOTE]\n> Useful information.");
    expect(html).toContain('<div class="markdown-alert markdown-alert-note">');
    expect(html).toContain('<p class="markdown-alert-title">Note</p>');
    expect(html).toContain("<p>Useful information.</p>");
    expect(html).not.toContain("[!NOTE]");
  });

  it("supports every type, case-insensitively", async () => {
    for (const type of ["TIP", "important", "Warning", "CAUTION"]) {
      const html = await renderMarkdown(`> [!${type}]\n> body`);
      expect(html).toContain(`markdown-alert-${type.toLowerCase()}`);
    }
  });

  it("leaves ordinary quotes and inline markers alone", async () => {
    expect(await renderMarkdown("> just a quote")).toContain("<blockquote>");
    const inline = await renderMarkdown("> [!NOTE] not alone on its line");
    expect(inline).toContain("<blockquote>");
    expect(inline).toContain("[!NOTE]");
  });

  it("does not let users forge other class names", async () => {
    const html = await renderMarkdown('<div class="markdown-alert evil">x</div>');
    expect(html).not.toContain("evil");
  });
});

describe("<picture> (dark/light logos)", () => {
  it("keeps picture/source/srcset/media", async () => {
    const html = await renderMarkdown(
      '<picture><source media="(prefers-color-scheme: dark)" srcset="dark.png"><img src="light.png" alt="logo"></picture>',
    );
    // GitHub wraps a one-line <picture> in <p> too
    expect(html).toContain("<p><picture>");
    // the color-scheme query is resolved for the rendering theme (light)
    expect(html).toContain('media="not all"');
    expect(html).toContain('srcset="dark.png"');
  });
});

describe("relative URL resolution", () => {
  const base: DocumentBase = {
    raw: "https://raw.githubusercontent.com/o/r/main/docs/README.md",
    rawRoot: "https://raw.githubusercontent.com/o/r/main/",
    web: "https://github.com/o/r/blob/main/docs/README.md",
    webRoot: "https://github.com/o/r/blob/main/",
  };

  it("resolves images against raw files and links against web pages", () => {
    expect(resolveDocumentUrl("./logo.png", "image", base)).toBe(
      "https://raw.githubusercontent.com/o/r/main/docs/logo.png",
    );
    expect(resolveDocumentUrl("../LICENSE", "link", base)).toBe(
      "https://github.com/o/r/blob/main/LICENSE",
    );
    expect(resolveDocumentUrl("/assets/a.svg", "image", base)).toBe(
      "https://raw.githubusercontent.com/o/r/main/assets/a.svg",
    );
  });

  it("leaves absolute URLs, anchors and other schemes untouched", () => {
    for (const url of ["https://x.dev/a.png", "#install", "mailto:a@b.c", "//cdn.dev/x"]) {
      expect(resolveDocumentUrl(url, "link", base)).toBe(url);
    }
  });

  it("applies to img, source and a in rendered HTML", async () => {
    const html = await renderMarkdown(
      '![a](img/a.png) [docs](guide.md)\n\n<picture><source srcset="dark.png 2x"><img src="light.png"></picture>',
      { base },
    );
    expect(html).toContain('src="https://raw.githubusercontent.com/o/r/main/docs/img/a.png"');
    expect(html).toContain('href="https://github.com/o/r/blob/main/docs/guide.md"');
    expect(html).toContain('srcset="https://raw.githubusercontent.com/o/r/main/docs/dark.png 2x"');
    expect(html).toContain('src="https://raw.githubusercontent.com/o/r/main/docs/light.png"');
  });

  it("does nothing without a base", async () => {
    expect(await renderMarkdown("![a](img/a.png)")).toContain('src="img/a.png"');
  });
});

describe("image sizing attributes", () => {
  it("mirrors width/height as inline styles that survive CSS resets, like GitHub", async () => {
    const html = await renderMarkdown('<img src="a.gif" align="right" height="230">');
    expect(html).toContain('height="230"');
    // GitHub's own rule: cap the height, never stretch or distort
    expect(html).toContain('style="height: auto; max-height: 230px"');
    const both = await renderMarkdown('<img src="a.png" width="50%" height="40px">');
    expect(both).toContain('style="width: 50%; height: auto; max-height: 40px"');
  });

  it("never passes user CSS through", async () => {
    const html = await renderMarkdown(
      '<img src="a.png" width="10;background:url(x)" style="position:fixed">',
    );
    // the invalid width stays an inert attribute; nothing becomes a style
    expect(html).not.toContain("style=");
    expect(html).not.toContain("position");
  });
});

// Cases probed against GitHub's Markdown API ("markdown" mode).
describe("top-level inline HTML becomes paragraphs, like GitHub", () => {
  const img = (n: string) => `<img src="https://x.test/${n}.png">`;
  const clean = (html: string) => html.replace(/\n/g, "~");

  it("wraps a standalone image line", async () => {
    expect(clean(await renderMarkdown(`para\n\n${img("a")}\n\nafter`))).toBe(
      `<p>para</p>~<p>${img("a")}</p>~<p>after</p>`,
    );
  });

  it("wraps each image line separately, and same-line images together", async () => {
    expect(clean(await renderMarkdown(`${img("a")}\n${img("b")}`))).toBe(
      `<p>${img("a")}</p>~<p>${img("b")}</p>`,
    );
    expect(clean(await renderMarkdown(`${img("a")} ${img("b")}`))).toBe(
      `<p>${img("a")} ${img("b")}</p>`,
    );
  });

  it("leaves text lines, <br> and multi-line elements alone", async () => {
    expect(clean(await renderMarkdown(`${img("a")}\ntext on next line`))).toBe(
      `<p>${img("a")}</p>~text on next line`,
    );
    expect(await renderMarkdown('<br clear="left">')).toBe('<br clear="left">');
    const multi = `<a href="https://x.test">\n  ${img("a")}\n</a>`;
    expect(await renderMarkdown(multi)).toBe(multi);
  });

  it("leaves block-level HTML alone", async () => {
    const div = `<div align="center">${img("a")}</div>`;
    expect(await renderMarkdown(div)).toBe(div);
    const p = `<p align="center">\n  ${img("a")}\n</p>`;
    expect(await renderMarkdown(p)).toBe(p);
  });
});

describe("theme-specific images follow the preview theme, like GitHub", () => {
  const picture =
    '<picture><source media="(prefers-color-scheme: dark)" srcset="d.png"><img src="l.png"></picture>';

  it("resolves <picture> color-scheme sources for the rendering theme", async () => {
    expect(await renderMarkdown(picture, { theme: "dark" })).toContain('media="all"');
    expect(await renderMarkdown(picture, { theme: "light" })).toContain('media="not all"');
  });

  it("drops #gh-*-mode-only images and links for the other theme", async () => {
    const md =
      "[![dark](https://x.test/d.svg#gh-dark-mode-only)](https://x.test/#gh-dark-mode-only)" +
      "[![light](https://x.test/l.svg#gh-light-mode-only)](https://x.test/#gh-light-mode-only)" +
      '\n\n<img src="https://x.test/raw-dark.svg#gh-dark-mode-only">';
    const light = await renderMarkdown(md, { theme: "light" });
    expect(light).toContain("l.svg");
    expect(light).not.toContain("d.svg");
    expect(light).not.toContain("raw-dark.svg");
    const dark = await renderMarkdown(md, { theme: "dark" });
    expect(dark).toContain("d.svg");
    expect(dark).toContain("raw-dark.svg");
    expect(dark).not.toContain("l.svg");
  });
});

describe("review fixes", () => {
  it("keeps a tag written across lines intact (no lost image, no stray text)", async () => {
    const html = await renderMarkdown(
      '<img src="https://x.test/a.png">\n<img\n  src="https://x.test/b.png"\n  width="50">',
    );
    expect(html).toContain('src="https://x.test/b.png"');
    expect(html).not.toContain("<p></p>");
    expect(html).not.toMatch(/>\s*src=/); // attributes never leak out as text
  });

  it("recognizes alerts in files with Windows line endings", async () => {
    const html = await renderMarkdown("> [!NOTE]\r\n> hello\r\n");
    expect(html).toContain("markdown-alert-note");
    expect(html).not.toContain("[!NOTE]");
  });
});
