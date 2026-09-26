import type { Element, ElementContent, Root as HastRoot } from "hast";
import type { Root as MdastRoot } from "mdast";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGemoji from "remark-gemoji";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { codeToHast } from "shiki";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { remarkGithubAlerts } from "./alerts";
import { remarkGithubInlineHtml } from "./html-paragraphs";
import { rehypeImageSize } from "./image-size";
import { type DocumentBase, rehypeResolveUrls } from "./resolve-urls";
import { sanitizeSchema } from "./sanitize-schema";
import { rehypeThemeImages } from "./theme-images";
import type { PreviewTheme } from "./types";

const SHIKI_THEME: Record<PreviewTheme, string> = {
  light: "github-light",
  dark: "github-dark",
};

interface CodeBlockTarget {
  parent: { children: ElementContent[] };
  index: number;
  lang: string;
  code: string;
}

function extractText(node: Element): string {
  let text = "";
  visit(node, "text", (t) => {
    text += t.value;
  });
  return text.replace(/\n$/, "");
}

function codeLanguage(codeEl: Element): string {
  const className = codeEl.properties?.className;
  if (Array.isArray(className)) {
    for (const cls of className) {
      if (typeof cls === "string" && cls.startsWith("language-")) {
        return cls.slice("language-".length);
      }
    }
  }
  return "text";
}

/**
 * Turns Mermaid source into an SVG string, or null when the source is
 * invalid or no renderer is available (the block then stays a code block).
 * Rendering needs a real browser layout engine, so each host supplies its
 * own: the web app runs Mermaid in the page, the API in headless Chromium.
 */
export type DiagramRenderer = (code: string) => Promise<string | null>;

/**
 * Replaces sanitized `<pre><code class="language-x">` blocks with
 * Shiki-highlighted markup, and ```` ```mermaid ```` blocks with the
 * diagram SVG. Runs after sanitize, so the inline token colors it emits are
 * preserved. Unknown languages fall back to plain.
 */
function rehypeShikiHighlight(options: { theme: PreviewTheme; renderDiagram?: DiagramRenderer }) {
  return async (tree: HastRoot) => {
    const targets: CodeBlockTarget[] = [];
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "pre" || parent == null || index == null) return;
      const codeEl = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!codeEl) return;
      targets.push({
        parent: parent as { children: ElementContent[] },
        index,
        lang: codeLanguage(codeEl),
        code: extractText(codeEl),
      });
    });

    for (const target of targets) {
      if (target.lang === "mermaid" && options.renderDiagram) {
        const svg = await options.renderDiagram(target.code);
        if (svg) {
          // Mermaid output is trusted host output (strict security level,
          // sanitized by the renderer) — emitted raw so the SVG survives.
          target.parent.children[target.index] = {
            type: "element",
            tagName: "div",
            properties: { className: ["mermaid-diagram"] },
            children: [{ type: "raw", value: svg } as unknown as ElementContent],
          };
          continue;
        }
      }
      let highlighted: HastRoot;
      try {
        highlighted = await codeToHast(target.code, {
          lang: target.lang,
          theme: SHIKI_THEME[options.theme],
        });
      } catch {
        try {
          highlighted = await codeToHast(target.code, {
            lang: "text",
            theme: SHIKI_THEME[options.theme],
          });
        } catch {
          continue;
        }
      }
      const pre = highlighted.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "pre",
      );
      if (pre) {
        target.parent.children[target.index] = pre;
      }
    }
  };
}

/**
 * CRLF/CR → LF. remark keeps `\r` inside text nodes, which breaks every
 * line-based rule (alert markers, inline-HTML lines) for Windows-authored
 * READMEs; GitHub treats all three line endings alike.
 */
export function normalizeNewlines(markdown: string): string {
  return markdown.includes("\r") ? markdown.replace(/\r\n?/g, "\n") : markdown;
}

/**
 * The one rendering pipeline. Preview (web), PDF (api), and the share
 * pages all call this — markdown in, sanitized GitHub-flavored HTML out.
 */
export async function renderMarkdown(
  markdown: string,
  options: {
    theme?: PreviewTheme;
    renderDiagram?: DiagramRenderer;
    /** Resolve relative image/link URLs against where the document lives. */
    base?: DocumentBase;
  } = {},
): Promise<string> {
  const theme = options.theme ?? "light";
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkGemoji)
    .use(remarkGithubAlerts)
    .use(remarkGithubInlineHtml)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeResolveUrls, { base: options.base })
    .use(rehypeImageSize)
    .use(rehypeThemeImages, { theme })
    .use(rehypeShikiHighlight, { theme, renderDiagram: options.renderDiagram })
    // Raw nodes can only come from the diagram step above: user HTML was
    // already parsed by rehype-raw and filtered by rehype-sanitize.
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(normalizeNewlines(markdown));
  return String(file);
}

/** Source of every ```` ```mermaid ```` block, in document order. */
export function extractMermaidBlocks(markdown: string | MdastRoot): string[] {
  // Most documents have no diagrams: skip the parse when that's certain.
  if (typeof markdown === "string" && !markdown.includes("mermaid")) return [];
  const tree = typeof markdown === "string" ? parseMarkdown(markdown) : markdown;
  const blocks: string[] = [];
  visit(tree, "code", (node) => {
    if (node.lang === "mermaid") blocks.push(node.value);
  });
  return blocks;
}

/**
 * Markdown -> mdast with GFM + emoji applied. The DOCX builder walks
 * this tree so its source of truth matches the HTML pipeline's parse.
 */
export function parseMarkdown(markdown: string): MdastRoot {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkGemoji)
    .use(remarkGithubAlerts);
  return processor.runSync(processor.parse(normalizeNewlines(markdown))) as MdastRoot;
}
