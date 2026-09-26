// Browser entry for print.test.ts: the real print path, minus the dialog.
import { type DocumentBase, renderMarkdown } from "@/shared";
import { mermaidRenderer } from "../../src/lib/mermaid";
import { preparePrint, renderPrintBody, whenPrintReady } from "../../src/lib/printPdf";

declare global {
  interface Window {
    preparePrintFor: (markdown: string, base?: DocumentBase) => Promise<void>;
    previewFor: (markdown: string) => Promise<void>;
  }
}

window.preparePrintFor = async (markdown, base) => {
  preparePrint(await renderPrintBody(markdown, base), "readme");
  await whenPrintReady();
};

/** Render into the app shell the way the light-theme preview does. */
window.previewFor = async (markdown) => {
  const preview = document.createElement("article");
  preview.className = "markdown-body";
  preview.innerHTML = await renderMarkdown(markdown, {
    theme: "light",
    renderDiagram: mermaidRenderer("light"),
  });
  document.getElementById("root")?.appendChild(preview);
};
