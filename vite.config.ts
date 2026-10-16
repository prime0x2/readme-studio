import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Fails the build when the share pages' Content-Security-Policy (public/_headers)
 * doesn't allow an inline script of the index.html that will actually be served,
 * which would leave /s/* pages without their theme script.
 */
function shareCspCheck(): Plugin {
  return {
    name: "share-csp-check",
    apply: "build",
    writeBundle(_options, bundle) {
      const page = bundle["index.html"];
      if (page?.type !== "asset") return;
      const html = String(page.source);
      const headers = readFileSync(new URL("./public/_headers", import.meta.url), "utf8");
      const csp =
        headers.match(/^\/s\/\*\n(?:\s+.*\n)*?\s+Content-Security-Policy:(.*)$/m)?.[1] ?? "";
      const inline = [...html.matchAll(/<script(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/script>/g)]
        .filter(({ groups }) => !/\bsrc=|type="application\/ld\+json"/.test(groups?.attrs ?? ""))
        .map(({ groups }) => groups?.body ?? "");
      for (const script of inline) {
        const hash = createHash("sha256").update(script, "utf8").digest("base64");
        if (!csp.includes(`'sha256-${hash}'`)) {
          this.error(
            `public/_headers: the /s/* Content-Security-Policy is missing 'sha256-${hash}' for an inline script in the built index.html.`,
          );
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), shareCspCheck()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 3000,
    // The share-link API runs in `pnpm dev:api` (wrangler dev on :8787).
    proxy: { "/api": "http://localhost:8787" },
  },
});
