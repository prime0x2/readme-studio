// Refresh the GitHub reference renderings of the parity fixtures:
//   pnpm fixtures:update
// Each fixtures/<name>.md is sent to GitHub's own Markdown API in
// "markdown" mode (how github.com renders README files; "gfm" mode is for
// comments and turns newlines into <br>) and saved as <name>.github.html.
// Set GITHUB_TOKEN to lift the 60 requests/hour anonymous limit.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("./fixtures/", import.meta.url));
const token = process.env.GITHUB_TOKEN;

const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
for (const file of files) {
  const res = await fetch("https://api.github.com/markdown", {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text: await readFile(join(dir, file), "utf8"), mode: "markdown" }),
  });
  if (!res.ok) throw new Error(`${file}: GitHub answered ${res.status} ${await res.text()}`);
  // GitHub proxies images through camo; point them back at the original
  // URL (kept in data-canonical-src) so the test can serve them locally.
  const html = (await res.text()).replace(/<(img|source)\b[^>]*>/g, (tag, name) => {
    const canonical = tag.match(/\sdata-canonical-src="([^"]*)"/);
    const attr = name === "img" ? "src" : "srcset";
    return canonical
      ? tag.replace(new RegExp(`\\s${attr}="[^"]*"`), ` ${attr}="${canonical[1]}"`)
      : tag;
  });
  const out = file.replace(/\.md$/, ".github.html");
  await writeFile(join(dir, out), html);
  console.log(`${file} -> ${out}`);
}
