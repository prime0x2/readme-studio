import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

interface Props {
  initialDoc: string;
  isDark: boolean;
  onChange: (doc: string) => void;
}

const lightHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600", color: "#bf440e" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.monospace, color: "#0550ae" },
  { tag: tags.link, color: "#e65a0f", textDecoration: "underline" },
  { tag: tags.url, color: "#6e7781" },
  { tag: tags.quote, color: "#57606a", fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.contentSeparator, color: "#f5721a" },
  { tag: tags.processingInstruction, color: "#a8a29e" },
]);

const darkHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600", color: "#f7b07a" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.monospace, color: "#79c0ff" },
  { tag: tags.link, color: "#f68d44", textDecoration: "underline" },
  { tag: tags.url, color: "#8b949e" },
  { tag: tags.quote, color: "#8b949e", fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.contentSeparator, color: "#f68d44" },
  { tag: tags.processingInstruction, color: "#57534e" },
]);

function chromeTheme(isDark: boolean) {
  return EditorView.theme(
    {
      "&": { backgroundColor: "transparent", color: isDark ? "#e7e5e4" : "#292524" },
      ".cm-cursor": { borderLeftColor: isDark ? "#f68d44" : "#e65a0f" },
      ".cm-activeLine": {
        backgroundColor: isDark ? "rgba(231, 229, 228, 0.04)" : "rgba(41, 37, 36, 0.035)",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: isDark ? "rgba(152, 56, 19, 0.5)" : "rgba(250, 209, 174, 0.6)",
      },
      ".cm-gutters": { display: "none" },
    },
    { dark: isDark },
  );
}

/** Wrap or unwrap the selection with an inline marker (e.g. ** or *). */
function toggleWrap(view: EditorView, marker: string): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const before = view.state.sliceDoc(Math.max(0, from - marker.length), from);
  const after = view.state.sliceDoc(to, to + marker.length);

  if (before === marker && after === marker) {
    view.dispatch({
      changes: [
        { from: from - marker.length, to: from, insert: "" },
        { from: to, to: to + marker.length, insert: "" },
      ],
    });
    return true;
  }
  view.dispatch({
    changes: { from, to, insert: `${marker}${selected}${marker}` },
    selection: { anchor: from + marker.length, head: to + marker.length },
  });
  return true;
}

function insertLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to) || "link text";
  const insert = `[${selected}](https://)`;
  const urlStart = from + selected.length + 3;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart, head: urlStart + 8 },
  });
  return true;
}

const formatKeymap = keymap.of([
  { key: "Mod-b", run: (view) => toggleWrap(view, "**") },
  { key: "Mod-i", run: (view) => toggleWrap(view, "*") },
  { key: "Mod-k", run: insertLink },
]);

export function CodeMirrorEditor({ initialDoc, isDark, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once by design — the component is keyed by section id + theme
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const state = EditorState.create({
      doc: initialDoc,
      extensions: [
        history(),
        formatKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(isDark ? darkHighlight : lightHighlight),
        chromeTheme(isDark),
        EditorView.lineWrapping,
        placeholder("Write your markdown here…"),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });

    const view = new EditorView({ state, parent: container });
    return () => view.destroy();
  }, []);

  return <div ref={containerRef} className="h-full overflow-hidden" />;
}
