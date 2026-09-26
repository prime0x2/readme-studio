/**
 * Minimal HTML-in-markdown handling for DOCX (SPEC §7.2): README idioms
 * only — `<img>` (badges/logos), alignment wrappers, `<details>`, `<br>`.
 * Everything else degrades to its text content.
 */

export interface ImgTag {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[2] ?? match[3] ?? match[4] ?? null) : null;
}

export function parseImgTags(html: string): ImgTag[] {
  const tags: ImgTag[] = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = attr(tag, "src");
    if (!src) continue;
    const width = Number.parseInt(attr(tag, "width") ?? "", 10);
    const height = Number.parseInt(attr(tag, "height") ?? "", 10);
    tags.push({
      src,
      alt: attr(tag, "alt") ?? "",
      width: Number.isFinite(width) ? width : undefined,
      height: Number.isFinite(height) ? height : undefined,
    });
  }
  return tags;
}

export function extractAlign(html: string): "center" | "right" | "left" | null {
  const value = html.match(/<(?:p|div|h\d)\b[^>]*\balign\s*=\s*["']?(center|right|left)/i);
  return (value?.[1]?.toLowerCase() as "center" | "right" | "left" | undefined) ?? null;
}

export function extractSummary(html: string): string | null {
  const match = html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
  return match?.[1] ? stripTags(match[1]).trim() : null;
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ");
}

export function decodeEntities(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
}
