import type { Html, Paragraph, Root, RootContent } from "mdast";

/*
 * GitHub wraps top-level inline HTML in paragraphs, line by line: a README
 * line `<img src="banner.png">` renders as `<p><img …></p>`. Without this,
 * two standalone images separated by a blank line sit side by side (they
 * are inline siblings sharing a line box) where GitHub stacks them, and a
 * floated image shifts the unrelated line before it.
 *
 * Observed rules (GitHub's Markdown API, "markdown" mode), applied to HTML
 * blocks that don't start with a block-level tag:
 *   - each line that starts with a tag and is balanced on its own becomes
 *     a paragraph (`<img a>\n<img b>` → two paragraphs);
 *   - lines inside a multi-line element are left alone
 *     (`<a href>\n  <img>\n</a>` stays as is);
 *   - `<br>` lines and plain text lines are left alone.
 */

// CommonMark HTML block types 1–6 start with these; only type 7 (any other
// tag) is paragraph-wrapped by GitHub.
const BLOCK_TAGS = new Set(
  (
    "address article aside base basefont blockquote body caption center col colgroup dd details " +
    "dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 " +
    "head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option " +
    "p param pre script search section style summary table tbody td textarea tfoot th thead title tr " +
    "track ul"
  ).split(" "),
);

const VOID_TAGS = new Set(
  "area base br col embed hr img input link meta source track wbr".split(" "),
);

const TAG = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;

function firstTagName(text: string): string | null {
  return (
    text
      .trimStart()
      .match(/^<([a-zA-Z][\w-]*)/)?.[1]
      ?.toLowerCase() ?? null
  );
}

/**
 * HTML nesting depth after `html`, starting from `depth`: +1 per open
 * tag, -1 per closing tag (void and self-closing tags don't nest).
 */
export function htmlDepthAfter(html: string, depth: number): number {
  let next = depth;
  for (const [, closing, rawName, selfClosing] of html.matchAll(TAG)) {
    const name = rawName?.toLowerCase() ?? "";
    if (closing) next = Math.max(0, next - 1);
    else if (!VOID_TAGS.has(name) && !selfClosing) next++;
  }
  return next;
}

/** True when a `<tag` on this text is still waiting for its `>`. */
function hasOpenTag(text: string): boolean {
  const start = Math.max(text.lastIndexOf("<"), -1);
  if (start < 0 || !/^<\/?[a-zA-Z]/.test(text.slice(start))) return false;
  return !text.slice(start).includes(">");
}

/** Physical lines, joined while a tag spans a line break. */
function logicalLines(html: string): string[] {
  const lines: string[] = [];
  for (const line of html.split("\n")) {
    const last = lines.at(-1);
    if (last !== undefined && hasOpenTag(last)) lines[lines.length - 1] = `${last}\n${line}`;
    else lines.push(line);
  }
  return lines;
}

function splitHtml(node: Html): RootContent[] {
  const first = firstTagName(node.value);
  if (!first || BLOCK_TAGS.has(first)) return [node];

  const out: RootContent[] = [];
  let pending: string[] = [];
  const flush = () => {
    if (pending.length > 0) out.push({ type: "html", value: pending.join("\n") });
    pending = [];
  };

  let depth = 0;
  for (const line of logicalLines(node.value)) {
    const tag = firstTagName(line);
    const after = htmlDepthAfter(line, depth);
    // A tag written across several lines stays raw: wrapping only its
    // first line would cut the tag and print its attributes as text.
    const singleLine = !line.includes("\n");
    if (singleLine && depth === 0 && after === 0 && tag && tag !== "br" && tag !== "wbr") {
      flush();
      const paragraph: Paragraph = {
        type: "paragraph",
        children: [{ type: "html", value: line.trim() }],
      };
      out.push(paragraph);
    } else {
      pending.push(line);
    }
    depth = after;
  }
  flush();
  return out;
}

/** Remark plugin: GitHub's paragraph wrapping of top-level inline HTML. */
export function remarkGithubInlineHtml() {
  return (tree: Root) => {
    tree.children = tree.children.flatMap((child) =>
      child.type === "html" ? splitHtml(child) : [child],
    );
  };
}
