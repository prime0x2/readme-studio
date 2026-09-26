import { ImageRun } from "docx";

/*
 * Images for DOCX export, independent of where they're loaded: the browser
 * supplies a loader that fetches and, when needed, rasterizes (see
 * browser-images.ts); tests supply a fake. This module caches, budgets,
 * sizes and wraps them as Word image runs.
 */

/** An image ready to embed: raster bytes Word understands, natural size in px. */
export interface LoadedImage {
  data: Uint8Array;
  type: "png" | "jpg" | "gif" | "bmp";
  naturalWidth: number;
  naturalHeight: number;
}

/** Load an image by URL; null when it can't be fetched or decoded. */
export type ImageLoader = (url: string) => Promise<LoadedImage | null>;

export type ImageCache = Map<string, Promise<LoadedImage | null>>;

/** A4 content width at 96dpi with our margins is ~660px; stay under it. */
export const MAX_WIDTH_PX = 600;

/**
 * Images one DOCX may embed, in total. Every embedded image stays in memory
 * until the document is packed, so a README listing hundreds of huge images
 * would otherwise exhaust the tab. Past the budget images fall back to
 * their alt text.
 */
export const DOCUMENT_IMAGE_BUDGET_BYTES = 40 * 1024 * 1024;

/**
 * Start loading every image up front, a few at a time. The builder walks
 * the document sequentially, and badge-heavy READMEs (60+ shields.io
 * images are common) would otherwise pay each round trip in turn.
 */
export function prefetchImages(
  urls: Iterable<string>,
  load: ImageLoader,
  concurrency = 8,
  budgetBytes = DOCUMENT_IMAGE_BUDGET_BYTES,
): ImageCache {
  const cache: ImageCache = new Map();
  let active = 0;
  let remaining = budgetBytes;
  const waiters: Array<() => void> = [];
  const run = async (url: string) => {
    while (active >= concurrency) await new Promise<void>((resolve) => waiters.push(resolve));
    active++;
    try {
      if (remaining <= 0) return null;
      const image = await load(url);
      if (!image || image.data.byteLength > remaining) return null;
      remaining -= image.data.byteLength;
      return image;
    } catch {
      return null;
    } finally {
      active--;
      waiters.shift()?.();
    }
  };
  for (const url of new Set(urls)) cache.set(url, run(url));
  return cache;
}

/** Display size in px: requested width/height, else natural, capped to the page. */
function displaySize(
  image: LoadedImage,
  requested: { width?: number; height?: number },
): { width: number; height: number } {
  let width = requested.width ?? image.naturalWidth;
  let height =
    requested.height ??
    (requested.width ? (image.naturalHeight * width) / image.naturalWidth : image.naturalHeight);
  if (width > MAX_WIDTH_PX) {
    height = (height * MAX_WIDTH_PX) / width;
    width = MAX_WIDTH_PX;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

function get(url: string, cache: ImageCache, load: ImageLoader): Promise<LoadedImage | null> {
  return cache.get(url) ?? load(url).catch(() => null);
}

/** The width (px) an image will be embedded at, or null if it can't be. */
export async function measureImageWidth(
  url: string,
  requested: { width?: number; height?: number },
  cache: ImageCache,
  load: ImageLoader,
): Promise<number | null> {
  const image = await get(url, cache, load);
  return image ? displaySize(image, requested).width : null;
}

/** A Word image run for the URL, or null (callers fall back to alt text). */
export async function fetchImageRun(
  url: string,
  requested: { width?: number; height?: number },
  cache: ImageCache,
  load: ImageLoader,
): Promise<ImageRun | null> {
  const image = await get(url, cache, load);
  if (!image) return null;
  return new ImageRun({
    type: image.type,
    data: image.data,
    transformation: displaySize(image, requested),
  });
}
