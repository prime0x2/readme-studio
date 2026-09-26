import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

/**
 * Where a document lives, so its relative URLs can be resolved the way
 * GitHub does: images against the raw file, links against the web page.
 * `/path` URLs are relative to the repository root, not the host.
 */
export interface DocumentBase {
  /** Raw file URL, e.g. https://raw.githubusercontent.com/o/r/main/README.md */
  raw: string;
  /** Repository root for raw files, e.g. https://raw.githubusercontent.com/o/r/main/ */
  rawRoot?: string;
  /** Web page of the file, e.g. https://github.com/o/r/blob/main/README.md */
  web?: string;
  /** Repository root for web pages, e.g. https://github.com/o/r/blob/main/ */
  webRoot?: string;
}

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** Resolve one URL from the document; absolute URLs and anchors pass through. */
export function resolveDocumentUrl(
  url: string,
  kind: "image" | "link",
  base: DocumentBase,
): string {
  const trimmed = url.trim();
  if (trimmed.length === 0 || ABSOLUTE.test(trimmed)) return url;
  const file = kind === "image" ? base.raw : (base.web ?? base.raw);
  const root = kind === "image" ? base.rawRoot : (base.webRoot ?? base.rawRoot);
  try {
    if (trimmed.startsWith("/")) {
      return root ? new URL(trimmed.slice(1), root).href : url;
    }
    return new URL(trimmed, file).href;
  } catch {
    return url;
  }
}

function resolveSrcset(srcset: string, base: DocumentBase): string {
  return srcset
    .split(",")
    .map((candidate) => {
      const [url, ...descriptors] = candidate.trim().split(/\s+/);
      return url ? [resolveDocumentUrl(url, "image", base), ...descriptors].join(" ") : candidate;
    })
    .join(", ");
}

/** Rehype step: resolve `img[src]`, `source[srcset]` and `a[href]`. */
export function rehypeResolveUrls(options: { base?: DocumentBase }) {
  return (tree: Root) => {
    const { base } = options;
    if (!base) return;
    visit(tree, "element", (node: Element) => {
      const props = node.properties;
      if (node.tagName === "img" && typeof props.src === "string") {
        props.src = resolveDocumentUrl(props.src, "image", base);
      } else if (node.tagName === "source" && props.srcSet != null) {
        // hast may keep srcset as a list of "url descriptor" candidates
        const candidates = Array.isArray(props.srcSet) ? props.srcSet : [props.srcSet];
        props.srcSet = candidates.map((c) => resolveSrcset(String(c), base)).join(", ");
      } else if (node.tagName === "a" && typeof props.href === "string") {
        props.href = resolveDocumentUrl(props.href, "link", base);
      }
    });
  };
}
