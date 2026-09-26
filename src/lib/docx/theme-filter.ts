import type { Definition, Parent, Root, RootContent } from "mdast";
import { modeOnlyTheme } from "@/shared";

/*
 * DOCX exports are light-themed, so everything GitHub shows only in dark
 * mode (`#gh-dark-mode-only`, the github-readme-stats convention) is
 * removed up front, in every form it's written: markdown images and
 * links, reference-style ones (the URL lives in a definition), and raw
 * HTML `<a href="…#gh-dark-mode-only">` / `<img src="…#gh-dark-mode-only">`.
 * Doing it once on the tree keeps the builder and the image prefetch from
 * each needing their own checks. (The HTML pipeline does the same thing
 * in shared/theme-images.ts.)
 */

const DARK = "#gh-dark-mode-only";
const ATTR_URL = String.raw`\s*=\s*["']?[^"'\s>]*${DARK}["']?`;
const DARK_ANCHOR = new RegExp(String.raw`<a\b[^>]*\bhref${ATTR_URL}[^>]*>[\s\S]*?<\/a>`, "gi");
const DARK_IMG = new RegExp(String.raw`<img\b[^>]*\bsrc${ATTR_URL}[^>]*>`, "gi");
const DARK_ANCHOR_OPEN = new RegExp(String.raw`^<a\b[^>]*\bhref${ATTR_URL}`, "i");
const ANCHOR_CLOSE = /<\/a>/i;

const isDark = (url: string | undefined | null) => modeOnlyTheme(url) === "dark";

export function dropDarkOnly(tree: Root, defs: Map<string, Definition>): void {
  const darkReference = (identifier: string) => isDark(defs.get(identifier.toLowerCase())?.url);

  const walk = (parent: Parent) => {
    const kept: RootContent[] = [];
    // Inline HTML arrives tag by tag: `<a href=…>`, `<img …>`, `</a>` are
    // separate nodes, so a dark anchor spans siblings until its `</a>`.
    let insideDarkAnchor = false;
    for (const child of parent.children as RootContent[]) {
      if (insideDarkAnchor) {
        if (child.type === "html" && ANCHOR_CLOSE.test(child.value)) insideDarkAnchor = false;
        continue;
      }
      if ((child.type === "image" || child.type === "link") && isDark(child.url)) continue;
      if (
        (child.type === "imageReference" || child.type === "linkReference") &&
        darkReference(child.identifier)
      ) {
        continue;
      }
      if (child.type === "html") {
        const value = child.value.trim();
        if (DARK_ANCHOR_OPEN.test(value) && !ANCHOR_CLOSE.test(value)) {
          insideDarkAnchor = true;
          continue;
        }
        child.value = child.value.replace(DARK_ANCHOR, "").replace(DARK_IMG, "");
        if (child.value.trim().length === 0) continue;
      }
      if ("children" in child) walk(child as Parent);
      kept.push(child);
    }
    parent.children = kept as Parent["children"];
  };
  walk(tree);
}
