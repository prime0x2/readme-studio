import type { Element, Root } from "hast";
import { SKIP, visit } from "unist-util-visit";
import type { PreviewTheme } from "./types";

/*
 * READMEs ship theme-specific images two ways, and GitHub picks by *its*
 * theme, not the operating system's:
 *   - <picture><source media="(prefers-color-scheme: dark)" …>: GitHub's
 *     <themed-picture> rewrites the media query to follow the site theme;
 *   - a URL ending in #gh-dark-mode-only / #gh-light-mode-only (the
 *     github-readme-stats convention): github.com's stylesheet hides
 *     `[href$="#gh-dark-mode-only"]` in light mode and vice versa.
 *     GitHub only matches *links*: a bare external image with the fragment
 *     stays visible there, because its wrapper link points at GitHub's
 *     image proxy, which drops the fragment. We hide bare images too, on
 *     purpose — the author's intent is unambiguous.
 * We render for an explicit preview theme (exports are always light), so
 * resolve both at render time instead of leaving them to the viewer's OS.
 */

const MODE_ONLY = /#gh-(dark|light)-mode-only$/;
const SCHEME_QUERY = /prefers-color-scheme:\s*(dark|light)/;

/** The theme a URL is restricted to, if any. */
export function modeOnlyTheme(url: unknown): PreviewTheme | null {
  const match = typeof url === "string" ? url.match(MODE_ONLY) : null;
  return (match?.[1] as PreviewTheme | undefined) ?? null;
}

export function rehypeThemeImages(options: { theme: PreviewTheme }) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      const only =
        node.tagName === "img"
          ? modeOnlyTheme(node.properties.src)
          : node.tagName === "a"
            ? modeOnlyTheme(node.properties.href)
            : null;
      if (only && only !== options.theme && parent && index != null) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      if (node.tagName === "source" && typeof node.properties.media === "string") {
        const scheme = node.properties.media.match(SCHEME_QUERY)?.[1];
        if (scheme) node.properties.media = scheme === options.theme ? "all" : "not all";
      }
      return undefined;
    });
  };
}
