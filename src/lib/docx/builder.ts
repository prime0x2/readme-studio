import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  type ParagraphChild,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type {
  Blockquote,
  Code,
  Definition,
  Heading,
  Html,
  List,
  ListItem,
  Paragraph as MdParagraph,
  Table as MdTable,
  PhrasingContent,
  Root,
  RootContent,
} from "mdast";
import { codeToTokensBase, type ThemedToken } from "shiki";
import { SKIP, visit } from "unist-util-visit";
import {
  ALERT_TITLES,
  alertTypeOf,
  type DocumentBase,
  extractMermaidBlocks,
  parseMarkdown,
  resolveDocumentUrl,
} from "@/shared";
import {
  decodeEntities,
  extractAlign,
  extractSummary,
  parseImgTags,
  stripTags,
} from "./html-fragments";
import {
  fetchImageRun,
  type ImageCache,
  type ImageLoader,
  MAX_WIDTH_PX,
  measureImageWidth,
  prefetchImages,
} from "./images";
import { dropDarkOnly } from "./theme-filter";

/*
 * Markdown AST -> Word. Typography mirrors the GitHub-light preview
 * (SPEC §7.2): real Heading styles, shaded mono code blocks with Shiki
 * token colors, GitHub-like table borders, embedded badges/images.
 */

const COLOR = {
  fg: "1F2328",
  muted: "59636E",
  border: "D1D9E0",
  accent: "0969DA",
  codeBg: "F6F8FA",
} as const;

// Code keeps Consolas — it is part of GitHub's own monospace fallback
// stack and ships with Word on every platform.
const FONT = { body: "Calibri", mono: "Consolas" } as const;

/** A4 width minus the 2cm margins, in twips. */
const CONTENT_WIDTH_DXA = 11906 - 2 * 1134;

const ORDERED_REF = "rs-ordered";
const BULLET_REF = "rs-bullet";

type DocxBlock = Paragraph | Table;

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  color?: string;
  underline?: boolean;
}

interface Ctx {
  defs: Map<string, Definition>;
  quoteDepth: number;
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  nextOrderedInstance: { value: number };
  diagrams: Map<string, RenderedDiagram>;
  loadImage: ImageLoader;
  /** Where the document lives, for relative image/link URLs. */
  base?: DocumentBase;
  images: ImageCache;
  /** Left-border color of the enclosing blockquote (alerts are colored). */
  quoteColor?: string;
}

function resolveUrl(url: string, kind: "image" | "link", ctx: Ctx): string {
  return ctx.base ? resolveDocumentUrl(url, kind, ctx.base) : url;
}

/** GitHub-light alert accent colors. */
const ALERT_COLOR = {
  note: "0969DA",
  tip: "1A7F37",
  important: "8250DF",
  warning: "9A6700",
  caution: "D1242F",
} as const;

const ALIGN = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
} as const;

function quoteParagraphOptions(ctx: Ctx): { border?: object; indent?: object } {
  if (ctx.quoteDepth === 0) return {};
  return {
    border: {
      left: {
        style: BorderStyle.SINGLE,
        size: 18,
        color: ctx.quoteColor ?? COLOR.border,
        space: 8,
      },
    },
    indent: { left: 240 * ctx.quoteDepth },
  };
}

function inlineText(nodes: PhrasingContent[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text" || node.type === "inlineCode") out += node.value;
    else if (node.type === "html") out += stripTags(node.value);
    else if ("children" in node) out += inlineText(node.children as PhrasingContent[]);
  }
  return out;
}

// ── Inline content ─────────────────────────────────────────────────────

async function inlinesToRuns(
  nodes: PhrasingContent[],
  ctx: Ctx,
  style: InlineStyle = {},
): Promise<ParagraphChild[]> {
  const runs: ParagraphChild[] = [];
  // Quotes read muted, like GitHub; alert bodies (colored border) do not.
  const color = style.color ?? (ctx.quoteDepth > 0 && !ctx.quoteColor ? COLOR.muted : undefined);
  const base = {
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    color,
    underline: style.underline ? {} : undefined,
  };

  for (const node of nodes) {
    switch (node.type) {
      case "text":
        runs.push(new TextRun({ ...base, text: node.value.replaceAll("\n", " ") }));
        break;
      case "emphasis":
        runs.push(...(await inlinesToRuns(node.children, ctx, { ...style, italics: true })));
        break;
      case "strong":
        runs.push(...(await inlinesToRuns(node.children, ctx, { ...style, bold: true })));
        break;
      case "delete":
        runs.push(...(await inlinesToRuns(node.children, ctx, { ...style, strike: true })));
        break;
      case "inlineCode":
        runs.push(
          new TextRun({
            ...base,
            text: node.value,
            font: FONT.mono,
            size: 19,
            shading: { type: ShadingType.CLEAR, fill: COLOR.codeBg },
          }),
        );
        break;
      case "link": {
        const children = await inlinesToRuns(node.children, ctx, {
          ...style,
          color: COLOR.accent,
          underline: true,
        });
        runs.push(new ExternalHyperlink({ link: resolveUrl(node.url, "link", ctx), children }));
        break;
      }
      case "linkReference": {
        const def = ctx.defs.get(node.identifier.toLowerCase());
        const children = await inlinesToRuns(node.children, ctx, {
          ...style,
          color: COLOR.accent,
          underline: def ? true : undefined,
        });
        if (def) {
          runs.push(new ExternalHyperlink({ link: resolveUrl(def.url, "link", ctx), children }));
        } else {
          runs.push(...children);
        }
        break;
      }
      case "image": {
        const image = await fetchImageRun(
          resolveUrl(node.url, "image", ctx),
          {},
          ctx.images,
          ctx.loadImage,
        );
        runs.push(image ?? altTextRun(node.alt ?? undefined));
        break;
      }
      case "imageReference": {
        const def = ctx.defs.get(node.identifier.toLowerCase());
        const image = def
          ? await fetchImageRun(resolveUrl(def.url, "image", ctx), {}, ctx.images, ctx.loadImage)
          : null;
        runs.push(image ?? altTextRun(node.alt ?? undefined));
        break;
      }
      case "break":
        runs.push(new TextRun({ text: "", break: 1 }));
        break;
      case "html": {
        runs.push(...(await inlineHtmlToRuns(node.value, ctx, { ...style, color })));
        break;
      }
      case "footnoteReference":
        runs.push(new TextRun({ ...base, text: `[${node.identifier}]`, superScript: true }));
        break;
    }
  }
  return runs;
}

function altTextRun(alt?: string): TextRun {
  return new TextRun({
    text: alt && alt.length > 0 ? `[${alt}]` : "[image]",
    italics: true,
    color: COLOR.muted,
  });
}

async function inlineHtmlToRuns(
  html: string,
  ctx: Ctx,
  style: InlineStyle,
): Promise<ParagraphChild[]> {
  const runs: ParagraphChild[] = [];
  const imgs = parseImgTags(html);
  for (const img of imgs) {
    const image = await fetchImageRun(
      resolveUrl(img.src, "image", ctx),
      { width: img.width, height: img.height },
      ctx.images,
      ctx.loadImage,
    );
    runs.push(image ?? altTextRun(img.alt));
  }
  if (/<br\s*\/?>/i.test(html)) runs.push(new TextRun({ text: "", break: 1 }));
  if (imgs.length === 0) {
    const text = stripTags(html).trim();
    if (text.length > 0) {
      runs.push(
        new TextRun({
          text,
          bold: style.bold,
          italics: style.italics,
          strike: style.strike,
          color: style.color,
          underline: style.underline ? {} : undefined,
        }),
      );
    }
  }
  return runs;
}

// ── Block content ──────────────────────────────────────────────────────

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

async function headingToParagraph(node: Heading, ctx: Ctx): Promise<Paragraph> {
  return new Paragraph({
    heading: HEADING_LEVELS[node.depth - 1],
    keepNext: true,
    children: await inlinesToRuns(node.children, ctx),
  });
}

async function paragraphToBlocks(node: MdParagraph, ctx: Ctx): Promise<DocxBlock[]> {
  const runs = await inlinesToRuns(node.children, ctx);
  if (runs.length === 0) return [];
  return [
    new Paragraph({
      children: runs,
      alignment: ctx.alignment,
      ...quoteParagraphOptions(ctx),
    }),
  ];
}

const CODE_LINE_SPACING = { before: 0, after: 0 } as const;

function diagramToBlocks(diagram: RenderedDiagram): DocxBlock[] {
  const scale = Math.min(1, MAX_WIDTH_PX / diagram.width);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          type: "png",
          data: diagram.png,
          transformation: {
            width: Math.round(diagram.width * scale),
            height: Math.round(diagram.height * scale),
          },
        }),
      ],
    }),
  ];
}

async function codeToBlocks(node: Code, ctx: Ctx): Promise<DocxBlock[]> {
  const diagram = node.lang === "mermaid" ? ctx.diagrams.get(node.value) : undefined;
  if (diagram?.png) return diagramToBlocks({ ...diagram, png: diagram.png });

  let lines: ThemedToken[][];
  try {
    lines = await codeToTokensBase(node.value, {
      lang: (node.lang ?? "text") as never,
      theme: "github-light",
    });
  } catch {
    lines = node.value
      .split("\n")
      .map((line) => [{ content: line, color: COLOR.fg, offset: 0 } as ThemedToken]);
  }

  const paragraphs = lines.map(
    (tokens) =>
      new Paragraph({
        spacing: CODE_LINE_SPACING,
        children:
          tokens.length > 0
            ? tokens.map(
                (token) =>
                  new TextRun({
                    text: token.content,
                    font: FONT.mono,
                    size: 18,
                    color: (token.color ?? `#${COLOR.fg}`).replace("#", ""),
                  }),
              )
            : [new TextRun({ text: "", font: FONT.mono, size: 18 })],
      }),
  );

  // Width must be absolute (dxa): Word misreads percentage widths here and
  // collapses the table to one character per line.
  const table = new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH_DXA],
    layout: TableLayoutType.FIXED,
    borders: noTableBorders(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: COLOR.codeBg },
            margins: { top: 160, bottom: 160, left: 240, right: 240 },
            children: paragraphs,
          }),
        ],
      }),
    ],
  });
  return [table, spacerParagraph()];
}

function noTableBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
  return {
    top: none,
    bottom: none,
    left: none,
    right: none,
    insideHorizontal: none,
    insideVertical: none,
  };
}

function spacerParagraph(): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: 0 }, children: [] });
}

async function listToBlocks(node: List, ctx: Ctx, level = 0): Promise<DocxBlock[]> {
  const blocks: DocxBlock[] = [];
  const instance = node.ordered ? ctx.nextOrderedInstance.value++ : 0;

  for (const item of node.children as ListItem[]) {
    let firstParagraphDone = false;
    for (const child of item.children) {
      if (child.type === "paragraph" && !firstParagraphDone) {
        firstParagraphDone = true;
        const runs: ParagraphChild[] = [];
        if (item.checked === true) runs.push(new TextRun({ text: "☒  " }));
        else if (item.checked === false) runs.push(new TextRun({ text: "☐  " }));
        runs.push(...(await inlinesToRuns(child.children, ctx)));

        if (item.checked != null) {
          blocks.push(
            new Paragraph({
              children: runs,
              indent: { left: 360 + 720 * level },
              spacing: { after: 40 },
            }),
          );
        } else {
          blocks.push(
            new Paragraph({
              children: runs,
              spacing: { after: 40 },
              ...(node.ordered
                ? { numbering: { reference: ORDERED_REF, level, instance } }
                : { numbering: { reference: BULLET_REF, level } }),
            }),
          );
        }
      } else if (child.type === "list") {
        blocks.push(...(await listToBlocks(child, ctx, Math.min(level + 1, 5))));
      } else if (child.type === "paragraph") {
        const runs = await inlinesToRuns(child.children, ctx);
        blocks.push(
          new Paragraph({
            children: runs,
            indent: { left: 720 * (level + 1) },
            spacing: { after: 40 },
          }),
        );
      } else {
        blocks.push(...(await blockToBlocks(child, ctx)));
      }
    }
  }
  if (level === 0) blocks.push(spacerParagraph());
  return blocks;
}

// Rough per-character advance widths (twips) for the table sizing heuristic.
const BODY_CHAR_DXA = 115; // Calibri 11pt average
const MONO_CHAR_DXA = 105; // Consolas 9.5pt
const PX_DXA = 15; // 1 CSS px at 96 dpi
const DEFAULT_IMAGE_DXA = 1500; // badge-sized image with no width attribute
const CELL_PADDING_DXA = 2 * 160 + 40; // left/right margins + borders
const MIN_COLUMN_DXA = 700;
const FONT_SLACK = 1.1;

interface CellExtent {
  /** Longest unbreakable run (word, image) — below this, words split. */
  min: number;
  /** Widest line with no wrapping at all. */
  max: number;
}

/**
 * Measured display widths (px) of a table's images, keyed by imageKey().
 * Without it, images count as DEFAULT_IMAGE_DXA wide.
 */
export type ImageWidths = ReadonlyMap<string, number>;

/** Lookup key for an image as written in a cell. */
function imageKey(
  image: { kind: "url"; url: string } | { kind: "ref"; identifier: string } | ImgTagSize,
): string {
  if ("kind" in image) return image.kind === "url" ? `url:${image.url}` : `ref:${image.identifier}`;
  return `img:${image.src}|${image.width ?? ""}|${image.height ?? ""}`;
}

interface ImgTagSize {
  src: string;
  width?: number;
  height?: number;
}

/** Estimated min/max-content widths of a cell, in twips. */
function cellExtent(nodes: PhrasingContent[], imageWidths?: ImageWidths): CellExtent {
  const measured = (key: string, fallback: number) => {
    const px = imageWidths?.get(key);
    return px != null ? px * PX_DXA : fallback;
  };
  let min = 0;
  let longestLine = 0;
  let line = 0;
  const addText = (text: string, charWidth: number) => {
    line += text.length * charWidth;
    for (const word of text.split(/\s+/)) min = Math.max(min, word.length * charWidth);
  };
  const addImage = (width: number) => {
    line += width;
    min = Math.max(min, width);
  };
  const breakLine = () => {
    longestLine = Math.max(longestLine, line);
    line = 0;
  };
  const walk = (children: PhrasingContent[]) => {
    for (const child of children) {
      if (child.type === "text") addText(child.value, BODY_CHAR_DXA);
      else if (child.type === "inlineCode") addText(child.value, MONO_CHAR_DXA);
      else if (child.type === "image") {
        addImage(measured(imageKey({ kind: "url", url: child.url }), DEFAULT_IMAGE_DXA));
      } else if (child.type === "imageReference") {
        addImage(
          measured(imageKey({ kind: "ref", identifier: child.identifier }), DEFAULT_IMAGE_DXA),
        );
      } else if (child.type === "break") breakLine();
      else if (child.type === "html") {
        const imgs = parseImgTags(child.value);
        for (const img of imgs) {
          addImage(measured(imageKey(img), img.width ? img.width * PX_DXA : DEFAULT_IMAGE_DXA));
        }
        if (/<br\s*\/?>/i.test(child.value)) breakLine();
        else if (imgs.length === 0) addText(stripTags(child.value), BODY_CHAR_DXA);
      } else if ("children" in child) walk(child.children as PhrasingContent[]);
    }
  };
  walk(nodes);
  return {
    min: min + CELL_PADDING_DXA,
    max: Math.max(longestLine, line) + CELL_PADDING_DXA,
  };
}

/**
 * Explicit column widths (twips) following the browser's auto table
 * layout, so DOCX tables look like the preview: a table that fits keeps
 * its natural width; a wide one shrinks toward each column's longest word
 * before any word has to split. Word and LibreOffice both need real widths
 * — an auto-width table with an empty grid collapses in LibreOffice/Docs.
 */
export function tableColumnWidths(node: MdTable, imageWidths?: ImageWidths): number[] {
  const columns = Math.max(0, ...node.children.map((row) => row.children.length));
  const min = Array.from({ length: columns }, () => MIN_COLUMN_DXA);
  const max = Array.from({ length: columns }, () => MIN_COLUMN_DXA);
  for (const row of node.children) {
    row.children.forEach((cell, i) => {
      const extent = cellExtent(cell.children, imageWidths);
      min[i] = Math.max(min[i] ?? 0, extent.min);
      max[i] = Math.max(max[i] ?? 0, extent.max);
    });
  }
  const sum = (values: number[]) => values.reduce((total, w) => total + w, 0);
  const minTotal = sum(min);
  const maxTotal = sum(max);

  let widths: number[];
  if (maxTotal * FONT_SLACK <= CONTENT_WIDTH_DXA) {
    // Character widths are estimates, and viewers without Calibri substitute
    // wider fonts: when there's room, leave some so words don't wrap.
    widths = max.map((w) => w * FONT_SLACK);
  } else if (maxTotal <= CONTENT_WIDTH_DXA) {
    widths = max;
  } else if (minTotal <= CONTENT_WIDTH_DXA) {
    // Share the leftover space in proportion to how much each column wants.
    const spare = (CONTENT_WIDTH_DXA - minTotal) / (maxTotal - minTotal);
    widths = min.map((w, i) => w + ((max[i] ?? w) - w) * spare);
  } else {
    // Even the longest words don't fit: scale down, words will split.
    widths = min.map((w) => (w * CONTENT_WIDTH_DXA) / minTotal);
  }
  return widths.map(Math.floor);
}

/**
 * Real display widths of a table's images. They are downloaded before the
 * build starts, so sizing columns from them is cheap — and badges wider
 * than the old 100px guess no longer wrap one per line.
 */
async function measureTableImages(node: MdTable, ctx: Ctx): Promise<ImageWidths> {
  const jobs = new Map<string, Promise<number | null>>();
  visit(node, (child) => {
    if (child.type === "image") {
      const key = imageKey({ kind: "url", url: child.url });
      if (!jobs.has(key)) {
        jobs.set(
          key,
          measureImageWidth(resolveUrl(child.url, "image", ctx), {}, ctx.images, ctx.loadImage),
        );
      }
    } else if (child.type === "imageReference") {
      const def = ctx.defs.get(child.identifier.toLowerCase());
      const key = imageKey({ kind: "ref", identifier: child.identifier });
      if (def && !jobs.has(key)) {
        jobs.set(
          key,
          measureImageWidth(resolveUrl(def.url, "image", ctx), {}, ctx.images, ctx.loadImage),
        );
      }
    } else if (child.type === "html") {
      for (const img of parseImgTags(child.value)) {
        const key = imageKey(img);
        if (!jobs.has(key)) {
          jobs.set(
            key,
            measureImageWidth(
              resolveUrl(img.src, "image", ctx),
              { width: img.width, height: img.height },
              ctx.images,
              ctx.loadImage,
            ),
          );
        }
      }
    }
  });
  const widths = new Map<string, number>();
  for (const [key, job] of jobs) {
    const width = await job;
    if (width != null) widths.set(key, width);
  }
  return widths;
}

async function tableToBlocks(node: MdTable, ctx: Ctx): Promise<DocxBlock[]> {
  const border = { style: BorderStyle.SINGLE, size: 4, color: COLOR.border } as const;
  const aligns = node.align ?? [];
  const columnWidths = tableColumnWidths(node, await measureTableImages(node, ctx));

  const rows = await Promise.all(
    node.children.map(async (row, rowIndex) => {
      const isHeader = rowIndex === 0;
      const cells = await Promise.all(
        row.children.map(async (cell, colIndex) => {
          const runs = await inlinesToRuns(cell.children, ctx, {
            bold: isHeader ? true : undefined,
          });
          const align = aligns[colIndex];
          return new TableCell({
            width: { size: columnWidths[colIndex] ?? MIN_COLUMN_DXA, type: WidthType.DXA },
            shading: isHeader ? { type: ShadingType.CLEAR, fill: COLOR.codeBg } : undefined,
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: [
              new Paragraph({
                children: runs,
                spacing: { before: 0, after: 0 },
                alignment: align ? ALIGN[align] : undefined,
              }),
            ],
          });
        }),
      );
      return new TableRow({ children: cells, tableHeader: isHeader });
    }),
  );

  // Absolute (dxa) widths: percentage widths collapse in Word (see
  // codeToBlocks), auto widths collapse in LibreOffice.
  const table = new Table({
    width: {
      size: columnWidths.reduce((sum, w) => sum + w, 0),
      type: WidthType.DXA,
    },
    columnWidths,
    layout: TableLayoutType.FIXED,
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows,
  });
  return [table, spacerParagraph()];
}

async function blockquoteToBlocks(node: Blockquote, ctx: Ctx): Promise<DocxBlock[]> {
  const alert = alertTypeOf(node);
  const inner: Ctx = {
    ...ctx,
    quoteDepth: ctx.quoteDepth + 1,
    // A plain quote inside an alert is a plain quote: gray, muted.
    quoteColor: alert ? ALERT_COLOR[alert] : undefined,
  };
  if (!alert) return blocksToChildren(node.children, inner);
  // The first child is the title paragraph remarkGithubAlerts inserted.
  const title = new Paragraph({
    keepNext: true,
    ...quoteParagraphOptions(inner),
    children: [new TextRun({ text: ALERT_TITLES[alert], bold: true, color: ALERT_COLOR[alert] })],
  });
  return [title, ...(await blocksToChildren(node.children.slice(1), inner))];
}

async function htmlBlockToBlocks(node: Html, ctx: Ctx): Promise<DocxBlock[]> {
  const html = node.value;
  const blocks: DocxBlock[] = [];

  if (/<hr\s*\/?>/i.test(html)) return [thematicBreakParagraph()];

  // <details>: render expanded — summary as bold paragraph, body as text.
  const summary = extractSummary(html);
  if (summary) {
    blocks.push(new Paragraph({ children: [new TextRun({ text: summary, bold: true })] }));
  }

  const align = extractAlign(html);
  const alignment = align ? ALIGN[align] : ctx.alignment;
  const runs: ParagraphChild[] = [];

  for (const img of parseImgTags(html)) {
    const image = await fetchImageRun(
      resolveUrl(img.src, "image", ctx),
      { width: img.width, height: img.height },
      ctx.images,
      ctx.loadImage,
    );
    runs.push(image ?? altTextRun(img.alt));
    runs.push(new TextRun({ text: " " }));
  }

  const bodyHtml = summary ? html.replace(/<summary[^>]*>[\s\S]*?<\/summary>/i, "") : html;
  if (parseImgTags(html).length === 0) {
    const text = decodeEntities(
      bodyHtml
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/[ \t]+/g, " "),
    ).trim();
    if (text.length > 0) {
      const lines = text.split("\n").map((l) => l.trim());
      lines.forEach((line, i) => {
        if (i > 0) runs.push(new TextRun({ text: "", break: 1 }));
        if (line.length > 0) runs.push(new TextRun({ text: line }));
      });
    }
  }

  if (runs.length > 0) {
    blocks.push(new Paragraph({ children: runs, alignment }));
  }
  return blocks;
}

function thematicBreakParagraph(): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COLOR.border } },
    children: [],
  });
}

async function blockToBlocks(node: RootContent, ctx: Ctx): Promise<DocxBlock[]> {
  switch (node.type) {
    case "heading":
      return [await headingToParagraph(node, ctx)];
    case "paragraph":
      return paragraphToBlocks(node, ctx);
    case "code":
      return codeToBlocks(node, ctx);
    case "list":
      return listToBlocks(node, ctx);
    case "table":
      return tableToBlocks(node, ctx);
    case "blockquote":
      return blockquoteToBlocks(node, ctx);
    case "thematicBreak":
      return [thematicBreakParagraph()];
    case "html":
      return htmlBlockToBlocks(node, ctx);
    case "definition":
    case "footnoteDefinition":
      return [];
    default:
      if ("children" in node) {
        const text = inlineText(node.children as PhrasingContent[]).trim();
        if (text.length > 0) {
          return [new Paragraph({ children: [new TextRun({ text })] })];
        }
      }
      return [];
  }
}

async function blocksToChildren(nodes: RootContent[], ctx: Ctx): Promise<DocxBlock[]> {
  const blocks: DocxBlock[] = [];
  for (const node of nodes) {
    blocks.push(...(await blockToBlocks(node, ctx)));
  }
  return blocks;
}

// ── Document assembly ──────────────────────────────────────────────────

/** Every image URL the document will embed, resolved. */
function collectImageUrls(tree: Root, ctx: Ctx): string[] {
  const urls: string[] = [];
  visit(tree, (node, _index, parent) => {
    // Not embedded by the builder: footnote bodies, and block HTML that
    // contains <hr> (rendered as a plain rule).
    if (node.type === "footnoteDefinition") return SKIP;
    if (node.type === "html" && parent?.type !== "paragraph" && /<hr\s*\/?>/i.test(node.value)) {
      return SKIP;
    }
    if (node.type === "image") urls.push(resolveUrl(node.url, "image", ctx));
    else if (node.type === "imageReference") {
      const def = ctx.defs.get(node.identifier.toLowerCase());
      if (def) urls.push(resolveUrl(def.url, "image", ctx));
    } else if (node.type === "html") {
      for (const img of parseImgTags(node.value)) urls.push(resolveUrl(img.src, "image", ctx));
    }
  });
  return urls;
}

function collectDefinitions(tree: Root): Map<string, Definition> {
  const defs = new Map<string, Definition>();
  visit(tree, "definition", (node) => {
    defs.set(node.identifier.toLowerCase(), node);
  });
  return defs;
}

const HEADING_BORDER = {
  bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR.border, space: 4 },
} as const;

/** A ```mermaid diagram rasterized for Word: 2x PNG, natural size in px. */
export interface RenderedDiagram {
  png: Uint8Array;
  width: number;
  height: number;
}

/** Diagram sources → rendered diagrams; sources left out stay code blocks. */
export type DiagramRasterizer = (sources: string[]) => Promise<Map<string, RenderedDiagram>>;

export interface DocxOptions {
  /** Where the document lives, for relative image/link URLs. */
  base?: DocumentBase;
  loadImage: ImageLoader;
  rasterizeDiagrams?: DiagramRasterizer;
}

export async function markdownToDocx(
  markdown: string,
  title: string,
  options: DocxOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const tree = parseMarkdown(markdown);
  const defs = collectDefinitions(tree);
  dropDarkOnly(tree, defs);
  const ctx: Ctx = {
    defs,
    quoteDepth: 0,
    nextOrderedInstance: { value: 1 },
    diagrams: new Map(),
    loadImage: options.loadImage,
    images: new Map(),
    base: options.base,
  };
  // Image downloads run while diagrams render; both before the walk.
  ctx.images = prefetchImages(collectImageUrls(tree, ctx), options.loadImage);
  const diagramSources = extractMermaidBlocks(tree);
  if (diagramSources.length > 0 && options.rasterizeDiagrams) {
    ctx.diagrams = await options.rasterizeDiagrams(diagramSources).catch(() => new Map());
  }
  const children = await blocksToChildren(tree.children, ctx);

  const heading = (size: number, extra: object = {}) => ({
    run: { font: FONT.body, size, bold: true, color: COLOR.fg },
    paragraph: { spacing: { before: 280, after: 160 }, ...extra },
  });

  const doc = new Document({
    title,
    description: "Generated by ReadmeStudio",
    styles: {
      default: {
        document: {
          run: { font: FONT.body, size: 22, color: COLOR.fg },
          paragraph: { spacing: { after: 160, line: 312 } },
        },
        heading1: heading(48, { border: HEADING_BORDER }),
        heading2: heading(36, { border: HEADING_BORDER }),
        heading3: heading(30),
        heading4: heading(24),
        heading5: heading(22),
        heading6: {
          run: { font: FONT.body, size: 22, bold: true, color: COLOR.muted },
          paragraph: { spacing: { before: 280, after: 160 } },
        },
        hyperlink: { run: { color: COLOR.accent, underline: {} } },
      },
    },
    numbering: {
      config: [
        {
          reference: ORDERED_REF,
          levels: [0, 1, 2, 3, 4, 5].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
        {
          reference: BULLET_REF,
          levels: [0, 1, 2, 3, 4, 5].map((level) => ({
            level,
            format: LevelFormat.BULLET,
            text: level % 2 === 0 ? "•" : "◦",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 in twips
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 }, // 2cm
          },
        },
        children,
      },
    ],
  });

  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
