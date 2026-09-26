import type { Blockquote, Paragraph, Root } from "mdast";
import { visit } from "unist-util-visit";

/*
 * GitHub alerts: a blockquote whose first line is exactly `[!NOTE]`,
 * `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]`.
 * https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts
 */

export const ALERT_TYPES = ["note", "tip", "important", "warning", "caution"] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_TITLES: Record<AlertType, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(\n|$)/i;

/** The alert type of a blockquote already transformed by remarkGithubAlerts. */
export function alertTypeOf(node: Blockquote): AlertType | null {
  return ((node.data as { alert?: AlertType } | undefined)?.alert as AlertType) ?? null;
}

/**
 * Marks alert blockquotes (`data.alert`) and shapes them for HTML as
 * `<div class="markdown-alert markdown-alert-{type}">` with a title line,
 * matching GitHub's markup so the same CSS applies.
 */
export function remarkGithubAlerts() {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const first = node.children[0];
      if (first?.type !== "paragraph") return;
      const text = first.children[0];
      if (text?.type !== "text") return;
      const match = text.value.match(MARKER);
      if (!match?.[1]) return;
      // The marker must be alone on its line: `[!NOTE] more text` stays a quote.
      const endsText = match[2] === "";
      const next = first.children[1];
      if (endsText && next && next.type !== "break") return;

      const type = match[1].toLowerCase() as AlertType;
      text.value = text.value.slice(match[0].length);
      if (text.value.length === 0) first.children.shift();
      if (first.children[0]?.type === "break") first.children.shift();
      if (first.children.length === 0) node.children.shift();

      const title: Paragraph = {
        type: "paragraph",
        data: { hProperties: { className: ["markdown-alert-title"] } },
        children: [{ type: "text", value: ALERT_TITLES[type] }],
      };
      node.children.unshift(title);
      node.data = {
        ...node.data,
        alert: type,
        hName: "div",
        hProperties: { className: ["markdown-alert", `markdown-alert-${type}`] },
      } as Blockquote["data"];
    });
  };
}
