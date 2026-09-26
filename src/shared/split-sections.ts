import type { Heading, PhrasingContent } from "mdast";
import { visit } from "unist-util-visit";
import { htmlDepthAfter } from "./html-paragraphs";
import { normalizeNewlines, parseMarkdown } from "./markdown";
import { extractTitle } from "./types";

export interface SplitSection {
  name: string;
  markdown: string;
}

function headingText(nodes: PhrasingContent[]): string {
  let text = "";
  for (const node of nodes) {
    if (node.type === "text" || node.type === "inlineCode") text += node.value;
    else if ("children" in node) text += headingText(node.children as PhrasingContent[]);
  }
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Cut an existing README into editor sections at its top-level `##`
 * headings (or `#` headings when it has no `##`). Sections are exact
 * slices of the source, so nothing is reformatted and joining them back
 * reproduces the document. Headings inside code blocks, lists or HTML are
 * not split points. Whatever precedes the first split (title, badges,
 * intro) becomes the first section.
 */
export function splitIntoSections(source: string): SplitSection[] {
  // Offsets below index the normalized text, so slice that same text.
  const markdown = normalizeNewlines(source);
  const tree = parseMarkdown(markdown);
  const headings: Heading[] = [];
  // Track open HTML elements across blocks: a heading inside
  // `<details>…</details>` (written with blank lines, so the heading is a
  // top-level node) must not cut the element in two.
  let htmlDepth = 0;
  for (const node of tree.children) {
    if (node.type === "html") htmlDepth = htmlDepthAfter(node.value, htmlDepth);
    else if (node.type === "heading" && htmlDepth === 0 && node.position?.start.offset != null) {
      headings.push(node);
    }
  }
  const level = headings.some((h) => h.depth === 2) ? 2 : 1;
  const splits = headings.filter((h) => h.depth <= level);

  const sections: SplitSection[] = [];
  const starts = splits.map((h) => h.position?.start.offset ?? 0);
  const leadEnd = starts[0] ?? markdown.length;

  const lead = markdown.slice(0, leadEnd);
  if (lead.trim().length > 0) {
    sections.push({ name: extractTitle(lead) ?? "Header", markdown: lead.trimEnd() });
  }
  splits.forEach((heading, i) => {
    const slice = markdown.slice(starts[i], starts[i + 1] ?? markdown.length).trimEnd();
    sections.push({ name: headingText(heading.children) || "Section", markdown: slice });
  });
  return sections;
}

/**
 * Every link/image reference definition (`[ci-badge]: https://…`) in the
 * document, one per line. The editor previews each section on its own, so
 * a badge written `[![CI][ci-badge]][ci]` in the header would otherwise
 * lose its definition at the bottom of the README; appending these to each
 * section keeps references resolving across sections. Definitions render
 * nothing themselves.
 */
export function referenceDefinitions(source: string): string {
  const markdown = normalizeNewlines(source);
  if (!/^ {0,3}\[[^\]]+\]:/m.test(markdown)) return "";
  const lines: string[] = [];
  visit(parseMarkdown(markdown), "definition", (node) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start != null && end != null) lines.push(markdown.slice(start, end).trim());
  });
  return lines.join("\n");
}
