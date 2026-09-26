import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

// "230", "230px" or "50%" — anything else is ignored, as browsers do.
function cssLength(value: unknown): string | null {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d+(?:\.\d+)?)(px|%)?$/);
  if (!match) return null;
  return match[2] === "%" ? `${match[1]}%` : `${match[1]}px`;
}

/**
 * Mirror `<img width height>` the way GitHub does. Browsers treat these
 * attributes as the weakest possible style, so a host page's CSS reset
 * (`img { height: auto }` in Tailwind's preflight) silently overrides them
 * — a `height="230"` logo rendered at its natural 480px. Inline styles win.
 * GitHub itself emits `height: auto; max-height: <h>` for a height
 * attribute (so it caps, never stretches or distorts), and keeps width as
 * given. Runs after sanitize and only emits validated lengths, so no
 * user-controlled CSS gets through.
 */
export function rehypeImageSize() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;
      const declarations: string[] = [];
      const width = cssLength(node.properties.width);
      const height = cssLength(node.properties.height);
      if (width) declarations.push(`width: ${width}`);
      if (height) declarations.push("height: auto", `max-height: ${height}`);
      if (declarations.length > 0) node.properties.style = declarations.join("; ");
    });
  };
}
