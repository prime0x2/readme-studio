import bengaliFontUrl from "@fontsource-variable/noto-sans-bengali/files/noto-sans-bengali-bengali-wght-normal.woff2?url";
import { renderMermaidForExport } from "../mermaid";
import type { DiagramRasterizer, RenderedDiagram } from "./builder";
import type { LoadedImage } from "./images";

/*
 * The browser side of DOCX export: fetching images (subject to the image
 * host's CORS policy, like any web app) and rasterizing what Word can't
 * embed — SVG badges, WebP/AVIF, Mermaid diagrams — through a canvas.
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
/** Rasterize at 2x for crisp output in Word. */
const SCALE = 2;

type Kind = LoadedImage["type"] | "svg" | "other";

function sniff(bytes: Uint8Array, contentType: string, url: string): Kind {
  const [a, b, c, d] = bytes;
  if (a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47) return "png";
  if (a === 0xff && b === 0xd8 && c === 0xff) return "jpg";
  if (a === 0x47 && b === 0x49 && c === 0x46) return "gif";
  if (a === 0x42 && b === 0x4d) return "bmp";
  if (contentType.includes("svg") || /\.svg($|[?#])/i.test(url)) return "svg";
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  return "other";
}

/** Draw an image blob onto a canvas at 2x and read it back as PNG. */
async function rasterize(
  blob: Blob,
): Promise<{ data: Uint8Array; naturalWidth: number; naturalHeight: number } | null> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = objectUrl;
    await img.decode();
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    if (!naturalWidth || !naturalHeight) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(naturalWidth * SCALE);
    canvas.height = Math.round(naturalHeight * SCALE);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) return null;
    return { data: new Uint8Array(await png.arrayBuffer()), naturalWidth, naturalHeight };
  } catch {
    return null; // undecodable, or a canvas the browser won't read back
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/*
 * Some image hosts don't send CORS headers, so a page can show their images
 * but not read them (readme-typing-svg, view counters, many icon services).
 * Those are retried through an image proxy that does: wsrv.nl by default,
 * a free open-source service. It only ever sees the URLs of images that
 * failed directly, and only during a DOCX export. VITE_IMAGE_PROXY points
 * elsewhere ("{url}" is replaced) or, set to empty, turns this off.
 */
const IMAGE_PROXY: string =
  import.meta.env.VITE_IMAGE_PROXY ?? "https://wsrv.nl/?url={url}&output=png";

async function fetchImage(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.ok ? res : null;
  } catch {
    return null; // network error — or, indistinguishably, CORS refused
  }
}

/** ImageLoader for the browser: direct, then via the image proxy, else null (alt text). */
export async function loadImageInBrowser(url: string): Promise<LoadedImage | null> {
  const direct = await fetchImage(url);
  if (direct) return decodeResponse(direct, url);
  if (!IMAGE_PROXY || !/^https?:/i.test(url)) return null;
  const proxied = await fetchImage(IMAGE_PROXY.replace("{url}", encodeURIComponent(url)));
  return proxied ? decodeResponse(proxied, url) : null;
}

async function decodeResponse(res: Response, url: string): Promise<LoadedImage | null> {
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;

  const kind = sniff(bytes, contentType, url);
  if (kind === "svg" || kind === "other") {
    const type = kind === "svg" ? "image/svg+xml" : contentType;
    const raster = await rasterize(new Blob([bytes], { type }));
    return raster ? { ...raster, type: "png" } : null;
  }
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: contentType }));
    const size = { naturalWidth: bitmap.width, naturalHeight: bitmap.height };
    bitmap.close();
    return { data: bytes, type: kind, ...size };
  } catch {
    return null;
  }
}

// ─── Diagrams ───────────────────────────────────────────────────────────────

let bengaliFontFace: Promise<string> | null = null;

/**
 * An SVG drawn as an image can't use the page's webfonts, so Bengali labels
 * need the font embedded in the SVG itself.
 */
function embeddedBengaliFont(): Promise<string> {
  bengaliFontFace ??= fetch(bengaliFontUrl)
    .then((res) => res.arrayBuffer())
    .then((buffer) => {
      let binary = "";
      for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
      return `@font-face { font-family: "Noto Sans Bengali Variable"; font-weight: 100 900; src: url(data:font/woff2;base64,${btoa(binary)}) format("woff2"); }`;
    })
    .catch(() => {
      bengaliFontFace = null;
      return "";
    });
  return bengaliFontFace;
}

async function rasterizeSvg(svgMarkup: string): Promise<RenderedDiagram | null> {
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName !== "svg") return null;
  const viewBox = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const width = viewBox[2];
  const height = viewBox[3];
  if (!width || !height) return null;
  // Natural size for the image decoder (Mermaid emits width="100%").
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.removeAttribute("style");
  if (/[ঀ-৿]/.test(svg.textContent ?? "")) {
    const style = doc.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = await embeddedBengaliFont();
    svg.insertBefore(style, svg.firstChild);
  }
  // Diagrams are drawn on white, as in the preview's light theme.
  const background = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", "#ffffff");
  svg.insertBefore(background, svg.firstChild);

  const markup = new XMLSerializer().serializeToString(svg);
  const raster = await rasterize(new Blob([markup], { type: "image/svg+xml" }));
  return raster ? { png: raster.data, width, height } : null;
}

/** DiagramRasterizer for the browser: Mermaid (export mode) → PNG. */
export const rasterizeDiagramsInBrowser: DiagramRasterizer = async (sources) => {
  const results = new Map<string, RenderedDiagram>();
  for (const source of new Set(sources)) {
    const svg = await renderMermaidForExport(source);
    const diagram = svg ? await rasterizeSvg(svg) : null;
    if (diagram) results.set(source, diagram);
  }
  return results;
};
