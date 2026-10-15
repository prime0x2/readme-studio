export interface SectionTemplate {
  slug: string;
  name: string;
  markdown: string;
}

export interface Section {
  id: string;
  slug: string;
  name: string;
  markdown: string;
  isCustom: boolean;
  /** A blank section that takes its name from its first heading as you type. */
  autoName?: boolean;
}

export type PreviewTheme = "light" | "dark";

/** Hard cap on markdown payload size for export/share endpoints (1 MiB). */
export const MARKDOWN_BYTE_LIMIT = 1024 * 1024;

/** Stitch ordered sections into the final document. */
export function assembleMarkdown(sections: Array<{ markdown: string }>): string {
  return sections
    .map((s) => s.markdown.replace(/^\n+/, "").replace(/\s+$/, ""))
    .filter((s) => s.length > 0)
    .join("\n\n")
    .concat("\n");
}

/** Heading text without inline Markdown, or null if nothing is left. */
function plainHeading(raw: string): string | null {
  const text = raw
    .replace(/[*_`~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
  return text.length > 0 ? text : null;
}

/** First level-1 heading text, used as the document title. */
export function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1] ? plainHeading(match[1]) : null;
}

/** Text of the first heading of any level, without closing #s. */
export function firstHeading(markdown: string): string | null {
  const match = markdown.match(/^#{1,6}[ \t]+(.+)$/m);
  return match?.[1] ? plainHeading(match[1].replace(/[ \t]+#+[ \t]*$/, "")) : null;
}

export const UNTITLED_SECTION_NAME = "Untitled";

/** What the sidebar and editor call a section; auto-named ones follow their first heading. */
export function sectionLabel(section: Pick<Section, "name" | "markdown" | "autoName">): string {
  if (!section.autoName) return section.name;
  return firstHeading(section.markdown) ?? UNTITLED_SECTION_NAME;
}

/** Safe export filename stem: "My Project!" -> "my-project". */
export function slugifyTitle(title: string | null | undefined): string {
  const slug = (title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug.length > 0 ? slug : "readme";
}
