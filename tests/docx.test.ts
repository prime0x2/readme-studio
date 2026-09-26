import { strFromU8, unzipSync } from "fflate";
import type { Table as MdTable } from "mdast";
import { describe, expect, it } from "vitest";
import { parseMarkdown } from "@/shared";
import {
  type DiagramRasterizer,
  type DocxOptions,
  markdownToDocx,
  tableColumnWidths,
} from "../src/lib/docx/builder";
import type { ImageLoader } from "../src/lib/docx/images";

// Stand-ins for the browser loader/rasterizer (tests/docx-browser covers
// the real ones): any URL loads as a 1x1 PNG unless it says "blocked".
const PNG_1X1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);
const fakeLoadImage: ImageLoader = async (url) =>
  url.includes("blocked")
    ? null
    : { data: PNG_1X1, type: "png", naturalWidth: 100, naturalHeight: 20 };
// Valid Mermaid starts with a diagram type; anything else stays code.
const fakeRasterize: DiagramRasterizer = async (sources) =>
  new Map(
    sources
      .filter((s) => /^(flowchart|graph|sequenceDiagram)\b/.test(s))
      .map((s) => [s, { png: PNG_1X1, width: 200, height: 80 }]),
  );

function build(markdown: string, title: string, options: Partial<DocxOptions> = {}) {
  return markdownToDocx(markdown, title, {
    loadImage: fakeLoadImage,
    rasterizeDiagrams: fakeRasterize,
    ...options,
  });
}

async function docxXml(markdown: string): Promise<{ document: string; rels: string }> {
  const buffer = await build(markdown, "Test Doc");
  const entries = unzipSync(new Uint8Array(buffer));
  const documentEntry = entries["word/document.xml"];
  const relsEntry = entries["word/_rels/document.xml.rels"];
  if (!documentEntry || !relsEntry) throw new Error("not a valid docx package");
  return { document: strFromU8(documentEntry), rels: strFromU8(relsEntry) };
}

describe("markdownToDocx — per-node mapping", () => {
  it("produces a valid docx package", async () => {
    const buffer = await build("# Hello", "T");
    // zip magic
    expect(String.fromCharCode(buffer[0] ?? 0, buffer[1] ?? 0)).toBe("PK");
  });

  it("maps headings to real Word Heading styles (navigation pane works)", async () => {
    const { document } = await docxXml("# One\n\n## Two\n\n### Three\n\n###### Six");
    expect(document).toContain('w:val="Heading1"');
    expect(document).toContain('w:val="Heading2"');
    expect(document).toContain('w:val="Heading3"');
    expect(document).toContain('w:val="Heading6"');
  });

  it("maps strong/emphasis/strikethrough to run properties", async () => {
    const { document } = await docxXml("**bold** *italic* ~~struck~~");
    expect(document).toContain("<w:b/>");
    expect(document).toContain("<w:i/>");
    expect(document).toContain("<w:strike/>");
    expect(document).toContain(">bold<");
    expect(document).toContain(">struck<");
  });

  it("renders inline code in mono font with shading", async () => {
    const { document } = await docxXml("uses `npm install` here");
    expect(document).toContain('w:ascii="Consolas"');
    expect(document).toContain('w:fill="F6F8FA"');
    expect(document).toContain(">npm install<");
  });

  it("creates real hyperlinks with an external relationship", async () => {
    const { document, rels } = await docxXml("[docs](https://docs.example.dev/guide)");
    expect(document).toContain("<w:hyperlink");
    expect(rels).toContain("https://docs.example.dev/guide");
    expect(document).toContain('w:val="0969DA"');
    expect(document).toContain("<w:u");
  });

  it("resolves reference-style links via definitions", async () => {
    const { rels } = await docxXml("[site][ref]\n\n[ref]: https://ref.example.dev");
    expect(rels).toContain("https://ref.example.dev");
  });

  it("maps tables with a bold shaded header row and cell alignment", async () => {
    const { document } = await docxXml("| Left | Right |\n|:-----|------:|\n| a | b |");
    expect(document).toContain("<w:tbl>");
    expect(document).toContain('w:fill="F6F8FA"'); // header shading
    expect(document).toContain('<w:jc w:val="right"/>'); // aligned column
    expect(document).toContain(">Left<");
    expect(document).toContain(">b<");
    // explicit dxa grid: percentage widths collapse in Word, auto in LibreOffice
    expect(document).toMatch(/<w:gridCol w:w="\d+"\/>/);
    expect(document).not.toContain('w:type="pct"');
  });

  it("sizes columns from measured image widths so badges stay on one line", () => {
    const table = parseMarkdown(
      "| Category | Technologies |\n|---|---|\n| Languages | ![JS](https://x.test/js.svg) ![TS](https://x.test/ts.svg) |",
    ).children[0] as MdTable;
    const guessed = tableColumnWidths(table);
    const measured = tableColumnWidths(
      table,
      new Map([
        ["url:https://x.test/js.svg", 150],
        ["url:https://x.test/ts.svg", 140],
      ]),
    );
    const bothBadges = (150 + 140) * 15; // px -> twips
    expect(guessed[1] ?? 0).toBeLessThan(bothBadges); // the old 100px guess wraps them
    expect(measured[1] ?? 0).toBeGreaterThan(bothBadges);
  });

  it("keeps narrow tables at their natural width and fits wide ones to the page", () => {
    const narrow = parseMarkdown("| a | b |\n|---|---|\n| 1 | 2 |").children[0] as MdTable;
    const narrowWidths = tableColumnWidths(narrow);
    expect(narrowWidths).toHaveLength(2);
    expect(narrowWidths.reduce((s, w) => s + w, 0)).toBeLessThan(3000);

    const cells = Array.from({ length: 9 }, (_, i) => `Column ${i} with a long heading`);
    const wide = parseMarkdown(
      `| ${cells.join(" | ")} |\n|${"---|".repeat(9)}\n| ${cells.join(" | ")} |`,
    ).children[0] as MdTable;
    const wideWidths = tableColumnWidths(wide);
    expect(wideWidths).toHaveLength(9);
    expect(wideWidths.reduce((s, w) => s + w, 0)).toBeLessThanOrEqual(11906 - 2 * 1134);
    for (const w of wideWidths) expect(w).toBeGreaterThan(0);
  });

  it("renders task lists with checkbox glyphs and no bullets", async () => {
    const { document } = await docxXml("- [x] shipped\n- [ ] pending");
    expect(document).toContain("☒");
    expect(document).toContain("☐");
    expect(document).toContain(">shipped<");
  });

  it("numbers ordered lists and bullets unordered ones, nested", async () => {
    const { document } = await docxXml("1. first\n2. second\n   - sub\n");
    expect(document).toContain("<w:numPr>");
    expect(document).toContain(">first<");
    expect(document).toContain(">sub<");
  });

  it("restarts numbering across separate ordered lists", async () => {
    const { document } = await docxXml("1. a\n\ntext between\n\n1. b\n");
    // two distinct concrete numbering instances must exist
    const numIds = [...document.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]);
    expect(new Set(numIds).size).toBeGreaterThanOrEqual(2);
  });

  it("colors code block tokens via Shiki and shades the block", async () => {
    const { document } = await docxXml('```ts\nconst x = "hi";\n```');
    expect(document).toContain('w:ascii="Consolas"');
    // github-light keyword color
    expect(document).toContain('w:val="D73A49"');
    expect(document).toContain('w:fill="F6F8FA"');
    // fixed absolute width — percentage widths collapse to ~1 char/line in Word
    expect(document).toMatch(/<w:tblW w:type="dxa" w:w="\d+"\/>/);
  });

  it("keeps the standard body font with bold headings (style definitions)", async () => {
    const buffer = await build("# Heading\n\nbody", "T");
    const entries = unzipSync(new Uint8Array(buffer));
    const styles = strFromU8(entries["word/styles.xml"] as Uint8Array);
    expect(styles).toContain('w:ascii="Calibri"');
  });

  it("falls back to plain mono for unknown code languages", async () => {
    const { document } = await docxXml("```nosuchlang\nplain text code\n```");
    expect(document).toContain(">plain text code<");
  });

  it("styles blockquotes with muted color and a left border", async () => {
    const { document } = await docxXml("> quoted wisdom");
    expect(document).toContain('w:val="59636E"');
    expect(document).toContain(">quoted wisdom<");
  });

  it("renders <details> expanded with bold summary", async () => {
    const { document } = await docxXml(
      "<details><summary>Click me</summary>\nhidden body\n</details>",
    );
    expect(document).toContain(">Click me<");
  });

  it("falls back to alt text when an image cannot be fetched", async () => {
    const { document } = await docxXml("![my badge](https://127.0.0.1/blocked.png)");
    expect(document).toContain("[my badge]");
  });

  it("handles thematic breaks and footnote refs without crashing", async () => {
    const { document } = await docxXml("above\n\n---\n\nbelow[^1]\n\n[^1]: note");
    expect(document).toContain(">above<");
    expect(document).toContain(">below<");
  });

  it("converts emoji shortcodes to unicode text", async () => {
    const { document } = await docxXml("launch :rocket: now");
    expect(document).toContain("🚀");
  });

  it("survives a kitchen-sink document", async () => {
    const kitchen = [
      "# Title :sparkles:",
      "Some **bold** and `code` and [link](https://example.com).",
      '```js\nconsole.log("hi");\n```',
      "| a | b |\n|---|---|\n| 1 | 2 |",
      "- [x] done\n- [ ] todo",
      "1. one\n2. two",
      "> quote",
      '<p align="center">centered</p>',
      "---",
      "the end",
    ].join("\n\n");
    const buffer = await build(kitchen, "Kitchen Sink");
    expect(buffer.byteLength).toBeGreaterThan(2000);
  });

  it("renders GitHub alerts with a colored title instead of the marker", async () => {
    const { document } = await docxXml("> [!WARNING]\n> Mind the gap.");
    expect(document).toContain(">Warning<");
    expect(document).toContain('w:color="9A6700"');
    expect(document).toContain(">Mind the gap.<");
    expect(document).not.toContain("[!WARNING]");
  });

  it("leaves out dark-only cards written reference-style or as raw HTML links", async () => {
    const { document, rels } = await docxXml(
      [
        "[![Stats][dark-card]][dark-link] [![Stats][light-card]][light-link]",
        '<a href="https://x.test/raw#gh-dark-mode-only">raw dark card</a> <a href="https://x.test/raw#gh-light-mode-only">raw light card</a>',
        "",
        "[dark-card]: https://x.test/d.svg",
        "[dark-link]: https://x.test/stats#gh-dark-mode-only",
        "[light-card]: https://x.test/l.svg",
        "[light-link]: https://x.test/stats#gh-light-mode-only",
      ].join("\n"),
    );
    expect(rels).not.toContain("#gh-dark-mode-only");
    expect(rels).toContain("#gh-light-mode-only");
    expect(document).not.toContain("raw dark card");
    expect(document).toContain("raw light card");
  });

  it("leaves out #gh-dark-mode-only images and links (exports are light)", async () => {
    const { document, rels } = await docxXml(
      "[dark card](https://x.test/stats#gh-dark-mode-only) [light card](https://x.test/stats#gh-light-mode-only)",
    );
    expect(document).not.toContain(">dark card<");
    expect(document).toContain(">light card<");
    expect(rels).not.toContain("#gh-dark-mode-only");
  });

  it("draws a plain quote nested in an alert gray, not in the alert color", async () => {
    const { document } = await docxXml("> [!WARNING]\n> careful\n>\n> > quoted");
    const quotedParagraph = document.split("<w:p>").find((p) => p.includes(">quoted<")) ?? "";
    expect(quotedParagraph).toContain('w:color="D1D9E0"');
    expect(quotedParagraph).not.toContain('w:color="9A6700"');
  });

  it("resolves relative links against the document base", async () => {
    const buffer = await build("[guide](docs/guide.md) [top](/LICENSE)", "T", {
      base: {
        raw: "https://raw.githubusercontent.com/o/r/main/README.md",
        rawRoot: "https://raw.githubusercontent.com/o/r/main/",
        web: "https://github.com/o/r/blob/main/README.md",
        webRoot: "https://github.com/o/r/blob/main/",
      },
    });
    const rels = strFromU8(
      unzipSync(new Uint8Array(buffer))["word/_rels/document.xml.rels"] ?? new Uint8Array(),
    );
    expect(rels).toContain("https://github.com/o/r/blob/main/docs/guide.md");
    expect(rels).toContain("https://github.com/o/r/blob/main/LICENSE");
  });

  it("embeds mermaid diagrams as images and keeps invalid ones as code", async () => {
    const { document } = await docxXml(
      "```mermaid\nflowchart LR\n  A --> B\n```\n\n```mermaid\nnot a diagram ???\n```",
    );
    expect(document).toContain("<w:drawing>");
    expect(document).not.toContain("flowchart LR");
    expect(document).toContain("not a diagram");
  });
});
