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

/** First level-1 heading text, used as the document title. */
export function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (!match?.[1]) return null;
  const title = match[1]
    .replace(/[*_`~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
  return title.length > 0 ? title : null;
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
