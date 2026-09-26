import { type DocumentBase, renderMarkdown, slugifyTitle } from "@/shared";
import { mermaidPrintRenderer } from "./mermaid";

/*
 * PDF export without a server: the document is rendered into the page in a
 * print-only container and the browser's print engine — the same engine a
 * headless Chrome uses for page.pdf() — prints just that. No iframe: every
 * browser prints the top-level page reliably (iOS Safari, for one, prints
 * the whole page rather than an iframe), and the app's styles apply as-is,
 * so the PDF matches the preview. The @page rules take over what the old
 * export server configured: A4, margins, page numbers, backgrounds.
 */

const ROOT_ID = "rs-print-root";

const PRINT_CSS = `
@page {
  size: A4;
  margin: 18mm 16mm;
  @bottom-center {
    content: counter(page) " / " counter(pages);
    font-size: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #9198a1;
  }
}
@media screen {
  #${ROOT_ID} { display: none !important; }
}
@media print {
  /* Only the document: hide the app, and let the page flow (the app shell
     pins html/body/#root to the viewport height). */
  body > *:not(#${ROOT_ID}) { display: none !important; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  #${ROOT_ID} { display: block !important; }
  /* Chrome's "Background graphics" is off by default: keep code/table shading. */
  #${ROOT_ID} * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

/** Rendered, sanitized document HTML for printing (light theme, like the old export). */
export function renderPrintBody(markdown: string, base?: DocumentBase): Promise<string> {
  return renderMarkdown(markdown, {
    theme: "light",
    base,
    renderDiagram: mermaidPrintRenderer(),
  });
}

/**
 * Put the document into the page, ready to print. Chrome and Edge name the
 * PDF after the page title, so it's the export filename until cleanup.
 * Returns the cleanup function.
 */
export function preparePrint(bodyHtml: string, filename: string): () => void {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(`${ROOT_ID}-style`)?.remove();

  const style = document.createElement("style");
  style.id = `${ROOT_ID}-style`;
  style.textContent = PRINT_CSS;
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("aria-hidden", "true");
  const article = document.createElement("article");
  article.className = "markdown-body";
  article.dataset.theme = "light";
  // Output of the shared pipeline, sanitized by rehype-sanitize.
  article.innerHTML = bodyHtml;
  root.appendChild(article);
  document.head.appendChild(style);
  document.body.appendChild(root);

  const previousTitle = document.title;
  document.title = filename;
  return () => {
    document.title = previousTitle;
    root.remove();
    style.remove();
  };
}

/** Resolve once fonts and the document's images have loaded (or after `timeoutMs`). */
export function whenPrintReady(timeoutMs = 10_000): Promise<void> {
  const images = [...(document.getElementById(ROOT_ID)?.querySelectorAll("img") ?? [])].map(
    (img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
  );
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  return Promise.race([
    Promise.all([document.fonts.ready, ...images]).then(() => undefined),
    timeout,
  ]);
}

/** Open the browser's print dialog for the document (→ "Save as PDF"). */
export async function printToPdf(
  markdown: string,
  title: string | null,
  base?: DocumentBase,
): Promise<void> {
  const bodyHtml = await renderPrintBody(markdown, base);
  const cleanup = preparePrint(bodyHtml, slugifyTitle(title));
  try {
    await whenPrintReady();
  } catch (err) {
    cleanup();
    throw err;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener("afterprint", finish);
    cleanup();
  };
  window.addEventListener("afterprint", finish);
  // Chrome blocks in print() until the dialog closes; Firefox and Safari
  // return at once and fire afterprint later. Either way afterprint ends it.
  window.print();
}
