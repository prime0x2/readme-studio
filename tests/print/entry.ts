// Browser entry for print.test.ts: the real print path, minus the dialog.
import type { DocumentBase } from "@/shared";
import { preparePrint, renderPrintBody, whenPrintReady } from "../../src/lib/printPdf";

declare global {
  interface Window {
    preparePrintFor: (markdown: string, base?: DocumentBase) => Promise<void>;
  }
}

window.preparePrintFor = async (markdown, base) => {
  preparePrint(await renderPrintBody(markdown, base), "readme");
  await whenPrintReady();
};
