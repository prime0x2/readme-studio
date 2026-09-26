// Browser entry for mermaid.test.ts: the preview's real rendering path
// (shared pipeline + the web app's lazy, sanitizing Mermaid renderer).
import { type PreviewTheme, renderMarkdown } from "@/shared";
import { mermaidRenderer } from "../../src/lib/mermaid";

declare global {
  interface Window {
    renderPreview: (markdown: string, theme: PreviewTheme) => Promise<string>;
  }
}

window.renderPreview = (markdown, theme) =>
  renderMarkdown(markdown, { theme, renderDiagram: mermaidRenderer(theme) });
