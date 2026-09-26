import { type DocumentBase, slugifyTitle } from "@/shared";

export type ExportFormat = "pdf" | "docx";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Instant, client-side. */
export function downloadMarkdownFile(markdown: string, filename = "README.md"): void {
  triggerDownload(new Blob([markdown], { type: "text/markdown" }), filename);
}

/** Shown as the print dialog opens: the two settings that matter. */
export const PDF_PRINT_HINT =
  "In the print dialog, choose “Save as PDF” as the destination and turn off “Headers and footers”.";

/**
 * Export in the browser — no server involved. PDF opens the print dialog
 * ("Save as PDF"); DOCX is built here and downloaded. The heavy parts load
 * on first use. Throws an Error with a user-facing message.
 */
export async function requestExport(
  format: ExportFormat,
  markdown: string,
  title: string | null,
  base?: DocumentBase,
): Promise<void> {
  if (format === "pdf") {
    const { printToPdf } = await import("./printPdf");
    await printToPdf(markdown, title, base);
    return;
  }
  let docx: Uint8Array<ArrayBuffer>;
  try {
    const [{ markdownToDocx }, browser] = await Promise.all([
      import("./docx/builder"),
      import("./docx/browser"),
    ]);
    docx = await markdownToDocx(markdown, title ?? "README", {
      base,
      loadImage: browser.loadImageInBrowser,
      rasterizeDiagrams: browser.rasterizeDiagramsInBrowser,
    });
  } catch {
    throw new Error("Couldn't build the DOCX file. Please try again.");
  }
  triggerDownload(
    new Blob([docx], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    `${slugifyTitle(title)}.docx`,
  );
}
