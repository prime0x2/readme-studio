import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderMarkdown } from "@/shared";
import {
  isViewRoute,
  loadRemoteReadme,
  parseSource,
  SourceError,
  shareUrl,
  sourceFromLocation,
} from "../src/lib/remoteReadme";

describe("parseSource", () => {
  it("reads github.com blob links", () => {
    expect(parseSource("https://github.com/prime0x2/prime0x2/blob/main/README.md")).toEqual({
      kind: "file",
      owner: "prime0x2",
      repo: "prime0x2",
      ref: "main",
      path: "README.md",
    });
  });

  it("reads raw links, including refs/heads/<branch>", () => {
    expect(
      parseSource("https://raw.githubusercontent.com/prime0x2/prime0x2/refs/heads/main/README.md"),
    ).toEqual({
      kind: "file",
      owner: "prime0x2",
      repo: "prime0x2",
      ref: "refs/heads/main",
      path: "README.md",
    });
    expect(parseSource("raw.githubusercontent.com/o/r/dev/docs/a.md")).toMatchObject({
      ref: "dev",
      path: "docs/a.md",
    });
  });

  it("reads repositories, trees and owner/repo shorthand", () => {
    expect(parseSource("https://github.com/o/r")).toEqual({ kind: "repo", owner: "o", repo: "r" });
    expect(parseSource("github.com/o/r.git")).toMatchObject({ kind: "repo", repo: "r" });
    expect(parseSource("o/r")).toMatchObject({ kind: "repo", owner: "o", repo: "r" });
    expect(parseSource("https://github.com/o/r/tree/dev/packages/x")).toEqual({
      kind: "repo",
      owner: "o",
      repo: "r",
      ref: "dev",
      dir: "packages/x",
    });
  });

  it("reads scheme-less links that look like owner/repo, and profile links", () => {
    expect(parseSource("github.com/torvalds")).toEqual({
      kind: "repo",
      owner: "torvalds",
      repo: "torvalds",
    });
    expect(parseSource("gist.github.com/0123abcd")).toEqual({ kind: "gist", id: "0123abcd" });
    expect(parseSource("prime0x2/readme.studio")).toMatchObject({
      owner: "prime0x2",
      repo: "readme.studio",
    });
  });

  it("reads gists", () => {
    expect(parseSource("https://gist.github.com/user/0123abcd")).toEqual({
      kind: "gist",
      id: "0123abcd",
    });
  });

  it("rejects hosts other than GitHub", () => {
    expect(() => parseSource("https://evil.example/README.md")).toThrow(SourceError);
    expect(() => parseSource("https://github.com.evil.example/o/r")).toThrow(SourceError);
    expect(() => parseSource("https://github.com/o/r/issues/1")).toThrow(SourceError);
  });
});

describe("share links", () => {
  const origin = "https://readme.prime0x2.dev";

  it("keeps the source readable and round-trips through the address", () => {
    const source = "https://raw.githubusercontent.com/prime0x2/prime0x2/refs/heads/main/README.md";
    const full = shareUrl(source, "full", origin);
    expect(full).toBe(`${origin}/view?mode=full&url=${source}`);
    const url = new URL(full);
    expect(sourceFromLocation(url)).toEqual({ source, mode: "full" });
    expect(sourceFromLocation(new URL(shareUrl(source, "normal", origin)))).toEqual({
      source,
      mode: "normal",
    });
  });

  it("escapes characters that would break the query string", () => {
    const url = new URL(shareUrl("https://github.com/o/r/blob/main/a&b#c.md", "normal", origin));
    expect(sourceFromLocation(url).source).toBe("https://github.com/o/r/blob/main/a&b#c.md");
  });

  it("accepts /link?=<url>, view=full and /gh/<owner>/<repo>", () => {
    expect(
      sourceFromLocation({ pathname: "/link", search: "?=https://github.com/o/r&view=full" }),
    ).toEqual({
      source: "https://github.com/o/r",
      mode: "full",
    });
    expect(sourceFromLocation({ pathname: "/gh/o/r", search: "" })).toEqual({
      source: "https://github.com/o/r",
      mode: "normal",
    });
  });

  it("routes only view addresses to the view page", () => {
    expect(isViewRoute("/view")).toBe(true);
    expect(isViewRoute("/link")).toBe(true);
    expect(isViewRoute("/gh/o/r")).toBe(true);
    expect(isViewRoute("/")).toBe(false);
  });
});

describe("loadRemoteReadme (GitHub mocked)", () => {
  type Route = { status?: number; json?: unknown; text?: string };
  let routes: Record<string, Route>;
  let requested: string[];

  beforeEach(() => {
    requested = [];
    routes = {};
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      requested.push(url);
      const route = routes[url];
      if (!route) return new Response("not found", { status: 404 });
      const body = route.json !== undefined ? JSON.stringify(route.json) : (route.text ?? "");
      return new Response(body, { status: route.status ?? 200 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("loads a blob link from the raw host, with raw and web bases", async () => {
    routes["https://raw.githubusercontent.com/o/r/main/docs/README.md"] = { text: "# Hi" };
    const readme = await loadRemoteReadme("https://github.com/o/r/blob/main/docs/README.md");
    expect(readme.markdown).toBe("# Hi");
    expect(readme.label).toBe("o/r · README.md");
    expect(readme.base).toEqual({
      raw: "https://raw.githubusercontent.com/o/r/main/docs/README.md",
      rawRoot: "https://raw.githubusercontent.com/o/r/main/",
      web: "https://github.com/o/r/blob/main/docs/README.md",
      webRoot: "https://github.com/o/r/blob/main/",
    });
  });

  it("finds a repository's README through the API, recovering the branch", async () => {
    routes["https://api.github.com/repos/o/r/readme"] = {
      json: {
        path: "README.md",
        download_url: "https://raw.githubusercontent.com/o/r/feature/x/README.md",
      },
    };
    routes["https://raw.githubusercontent.com/o/r/feature/x/README.md"] = { text: "![a](./a.png)" };
    const readme = await loadRemoteReadme("https://github.com/o/r");
    expect(readme.base.webRoot).toBe("https://github.com/o/r/blob/feature/x/");
    // …and relative images then resolve against that branch
    const html = await renderMarkdown(readme.markdown, { base: readme.base });
    expect(html).toContain('src="https://raw.githubusercontent.com/o/r/feature/x/a.png"');
  });

  it("asks the API for a subdirectory README at a ref", async () => {
    routes["https://api.github.com/repos/o/r/readme/packages/x?ref=dev"] = {
      json: {
        path: "packages/x/README.md",
        download_url: "https://raw.githubusercontent.com/o/r/dev/packages/x/README.md",
      },
    };
    routes["https://raw.githubusercontent.com/o/r/dev/packages/x/README.md"] = { text: "x" };
    const readme = await loadRemoteReadme("https://github.com/o/r/tree/dev/packages/x");
    expect(readme.base.web).toBe("https://github.com/o/r/blob/dev/packages/x/README.md");
  });

  it("falls back to HEAD/README.md when the API is rate-limited", async () => {
    routes["https://api.github.com/repos/o/r/readme"] = { status: 403, json: {} };
    routes["https://raw.githubusercontent.com/o/r/HEAD/README.md"] = { text: "fallback" };
    const readme = await loadRemoteReadme("o/r");
    expect(readme.markdown).toBe("fallback");
    expect(readme.base.web).toBe("https://github.com/o/r/blob/HEAD/README.md");
  });

  it("reports a missing repository without falling back", async () => {
    await expect(loadRemoteReadme("https://github.com/o/missing")).rejects.toThrow(/Not found/);
    expect(requested).toEqual(["https://api.github.com/repos/o/missing/readme"]);
  });

  it("loads the markdown file of a gist", async () => {
    routes["https://api.github.com/gists/abc123"] = {
      json: {
        owner: { login: "someone" },
        files: {
          "notes.txt": { filename: "notes.txt", raw_url: "https://gist.githubusercontent.com/t" },
          "GUIDE.md": { filename: "GUIDE.md", raw_url: "https://gist.githubusercontent.com/g" },
        },
      },
    };
    routes["https://gist.githubusercontent.com/g"] = { text: "# Guide" };
    const readme = await loadRemoteReadme("https://gist.github.com/someone/abc123");
    expect(readme.markdown).toBe("# Guide");
    expect(readme.label).toBe("gist by someone · GUIDE.md");
    expect(readme.base).toEqual({ raw: "https://gist.githubusercontent.com/g" });
  });

  it("refuses files over 1 MB", async () => {
    routes["https://raw.githubusercontent.com/o/r/main/big.md"] = {
      text: "x".repeat(1024 * 1024 + 1),
    };
    await expect(
      loadRemoteReadme("https://raw.githubusercontent.com/o/r/main/big.md"),
    ).rejects.toThrow(/larger than 1 MB/);
  });
});
