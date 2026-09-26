// Browser entry for docx-browser.test.ts: the real DOCX export path.
import { loadImageInBrowser, rasterizeDiagramsInBrowser } from "../../src/lib/docx/browser";
import { markdownToDocx } from "../../src/lib/docx/builder";

/** Dark (non-white) pixels in a PNG, to tell a drawn diagram from a blank one. */
async function inkPixels(png: Uint8Array<ArrayBuffer>): Promise<number> {
  const bitmap = await createImageBitmap(new Blob([png], { type: "image/png" }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i] ?? 255) < 100 && (data[i + 1] ?? 255) < 100 && (data[i + 2] ?? 255) < 100) ink++;
  }
  return ink;
}

const api = {
  async loadImage(url: string) {
    const image = await loadImageInBrowser(url);
    if (!image) return null;
    const { data, ...rest } = image;
    return { ...rest, bytes: data.byteLength, magic: Array.from(data.subarray(0, 4)) };
  },
  async rasterize(source: string) {
    const diagram = (await rasterizeDiagramsInBrowser([source])).get(source);
    if (!diagram) return null;
    const png = new Uint8Array(diagram.png);
    return { width: diagram.width, height: diagram.height, ink: await inkPixels(png) };
  },
  async buildDocx(markdown: string) {
    const docx = await markdownToDocx(markdown, "Test", {
      loadImage: loadImageInBrowser,
      rasterizeDiagrams: rasterizeDiagramsInBrowser,
    });
    return Array.from(docx);
  },
};

declare global {
  interface Window {
    docxTest: typeof api;
  }
}
window.docxTest = api;
