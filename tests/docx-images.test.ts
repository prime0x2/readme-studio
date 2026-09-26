import { describe, expect, it } from "vitest";
import { type ImageLoader, prefetchImages } from "../src/lib/docx/images";

// Every "download" is a 1 MB image, without touching the network.
const oneMegabyte: ImageLoader = async () => ({
  data: new Uint8Array(1024 * 1024),
  type: "png",
  naturalWidth: 10,
  naturalHeight: 10,
});

describe("prefetchImages", () => {
  it("stops embedding images once the document's byte budget is spent", async () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://x.test/${i}.png`);
    const cache = prefetchImages(urls, oneMegabyte, 4, 3.5 * 1024 * 1024);
    const images = await Promise.all(urls.map((url) => cache.get(url)));
    expect(images.filter(Boolean)).toHaveLength(3);
  });

  it("treats a loader that throws like a missing image", async () => {
    const cache = prefetchImages(["https://x.test/a.png"], async () => {
      throw new Error("boom");
    });
    await expect(cache.get("https://x.test/a.png")).resolves.toBeNull();
  });
});
