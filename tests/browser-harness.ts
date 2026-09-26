/**
 * Shared plumbing for tests that run real app code in headless Chromium:
 * build entries with the app's own Vite config (so CSS, Tailwind and code
 * splitting behave as in production), then serve everything to the page
 * through request interception on a fake origin — no ports, no network.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, HTTPRequest, Page } from "puppeteer";
import { build } from "vite";

export const WEB_ROOT = fileURLToPath(new URL("../", import.meta.url));
export const SITE = "https://app.readmestudio.test";

const MIME: Record<string, string> = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".woff2": "font/woff2",
  ".html": "text/html",
  ".svg": "image/svg+xml",
};

export interface Bundle {
  /** Public path of an entry's JS, e.g. /assets/styles.js */
  js(entry: string): string;
  /** Public paths of the CSS an entry pulls in. */
  css(entry: string): string[];
  /** Serve /assets/* from the build and /fonts/* from public/. */
  file(pathname: string): Promise<{ body: Buffer; contentType: string } | null>;
  dispose(): Promise<void>;
}

interface ManifestChunk {
  file: string;
  css?: string[];
}

/** Build the given entries (name → path relative to the repo root). */
export async function buildBundle(entries: Record<string, string>): Promise<Bundle> {
  const dir = await mkdtemp(join(tmpdir(), "rs-browser-test-"));
  const input = Object.fromEntries(
    Object.entries(entries).map(([name, path]) => [name, join(WEB_ROOT, path)]),
  );
  await build({
    root: WEB_ROOT,
    configFile: join(WEB_ROOT, "vite.config.ts"),
    logLevel: "error",
    build: {
      outDir: dir,
      emptyOutDir: true,
      copyPublicDir: false,
      manifest: true,
      rollupOptions: { input },
    },
  });
  const manifest = JSON.parse(await readFile(join(dir, ".vite/manifest.json"), "utf8")) as Record<
    string,
    ManifestChunk
  >;
  const chunk = (entry: string): ManifestChunk => {
    const source = entries[entry];
    const found = source ? manifest[source] : undefined;
    if (!found) throw new Error(`entry "${entry}" is missing from the build manifest`);
    return found;
  };

  return {
    js: (entry) => `/${chunk(entry).file}`,
    css: (entry) => (chunk(entry).css ?? []).map((file) => `/${file}`),
    async file(pathname) {
      const path = pathname.startsWith("/assets/")
        ? join(dir, pathname)
        : pathname.startsWith("/fonts/")
          ? join(WEB_ROOT, "public", pathname)
          : null;
      if (!path) return null;
      try {
        return {
          body: await readFile(path),
          contentType: MIME[extname(path)] ?? "application/octet-stream",
        };
      } catch {
        return null;
      }
    },
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
}

export type Responder = (url: URL) => Promise<{
  body: string | Buffer;
  contentType: string;
  headers?: Record<string, string>;
} | null>;

/**
 * A page whose every request is answered by `respond` (or aborted), so
 * nothing ever reaches the network.
 */
export async function interceptedPage(browser: Browser, respond: Responder): Promise<Page> {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (request: HTTPRequest) => {
    void (async () => {
      try {
        const answer = await respond(new URL(request.url()));
        if (answer) await request.respond({ status: 200, ...answer });
        else await request.abort();
      } catch {
        await request.abort().catch(() => undefined);
      }
    })();
  });
  return page;
}
