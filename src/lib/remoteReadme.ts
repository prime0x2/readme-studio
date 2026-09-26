import { type DocumentBase, MARKDOWN_BYTE_LIMIT } from "@/shared";

/*
 * Loading a README straight from GitHub for /view share links. Everything
 * is fetched by the viewer's browser (GitHub serves these with open CORS),
 * so no server is involved. Only GitHub hosts are accepted: a share link
 * on our domain must not be able to present arbitrary third-party pages.
 */

export interface RemoteReadme {
  markdown: string;
  base: DocumentBase;
  /** Short human label, e.g. "prime0x2/prime0x2 · README.md". */
  label: string;
}

/** A user-facing error (bad link, not found, rate limited…). */
export class SourceError extends Error {}

type Source =
  | { kind: "file"; owner: string; repo: string; ref: string; path: string }
  | { kind: "repo"; owner: string; repo: string; ref?: string; dir?: string }
  | { kind: "gist"; id: string }
  | { kind: "gist-raw"; url: string };

const UNSUPPORTED =
  "Only public GitHub links are supported: a repository, a file on github.com, a raw.githubusercontent.com URL, or a gist.";

/** `refs/heads/x` and `refs/tags/x` span three path segments. */
function splitRef(segments: string[]): { ref: string; rest: string[] } | null {
  if (segments[0] === "refs" && (segments[1] === "heads" || segments[1] === "tags")) {
    if (segments.length < 3) return null;
    return { ref: segments.slice(0, 3).join("/"), rest: segments.slice(3) };
  }
  const [ref, ...rest] = segments;
  return ref ? { ref, rest } : null;
}

export function parseSource(input: string): Source {
  let text = input.trim();
  // owner/repo shorthand. GitHub owners can't contain dots, so "github.com/x"
  // or "gist.github.com/x" is a scheme-less link, not an owner named "github.com".
  if (/^[\w-]+\/[\w.-]+$/.test(text)) text = `https://github.com/${text}`;
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new SourceError("That doesn't look like a link.");
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "github.com") {
    const [owner, rawRepo, kind, ...rest] = segments;
    const repo = rawRepo?.replace(/\.git$/, "");
    if (!owner) throw new SourceError(UNSUPPORTED);
    // github.com/<user> → the user's profile README (the <user>/<user> repo).
    if (!repo) return { kind: "repo", owner, repo: owner };
    if (!kind) return { kind: "repo", owner, repo };
    if (kind === "tree") {
      const split = splitRef(rest);
      return {
        kind: "repo",
        owner,
        repo,
        ref: split?.ref,
        dir: split?.rest.join("/") || undefined,
      };
    }
    if (kind === "blob" || kind === "raw") {
      const split = splitRef(rest);
      if (split && split.rest.length > 0) {
        return { kind: "file", owner, repo, ref: split.ref, path: split.rest.join("/") };
      }
    }
    throw new SourceError(UNSUPPORTED);
  }

  if (host === "raw.githubusercontent.com") {
    const [owner, repo, ...rest] = segments;
    const split = splitRef(rest);
    if (owner && repo && split && split.rest.length > 0) {
      return { kind: "file", owner, repo, ref: split.ref, path: split.rest.join("/") };
    }
    throw new SourceError(UNSUPPORTED);
  }

  if (host === "gist.github.com") {
    const id = segments.at(-1);
    if (id && /^[0-9a-f]+$/i.test(id)) return { kind: "gist", id };
    throw new SourceError(UNSUPPORTED);
  }

  if (host === "gist.githubusercontent.com" && segments.length >= 3) {
    return { kind: "gist-raw", url: url.href };
  }

  throw new SourceError(UNSUPPORTED);
}

function fileBase(owner: string, repo: string, ref: string, path: string): DocumentBase {
  const rawRoot = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/`;
  const webRoot = `https://github.com/${owner}/${repo}/blob/${ref}/`;
  return { raw: rawRoot + path, rawRoot, web: webRoot + path, webRoot };
}

async function fetchChecked(url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new SourceError("Couldn't reach GitHub. Check your connection and try again.");
  }
  if (res.status === 404) {
    throw new SourceError("Not found. Is the repository public and the path right?");
  }
  if (res.status === 403 || res.status === 429) {
    throw new SourceError(
      "GitHub is rate-limiting requests right now. Try again in a few minutes.",
    );
  }
  if (!res.ok) throw new SourceError(`GitHub answered with an error (${res.status}).`);
  return res;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetchChecked(url);
  const text = await res.text();
  if (new TextEncoder().encode(text).byteLength > MARKDOWN_BYTE_LIMIT) {
    throw new SourceError("That file is larger than 1 MB, which is too big to preview.");
  }
  return text;
}

const GITHUB_API = "https://api.github.com";
const API_HEADERS = { accept: "application/vnd.github+json" };

async function loadRepoReadme(
  owner: string,
  repo: string,
  ref?: string,
  dir?: string,
): Promise<RemoteReadme> {
  let path: string;
  let resolvedRef: string;
  try {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const res = await fetchChecked(
      `${GITHUB_API}/repos/${owner}/${repo}/readme${dir ? `/${dir}` : ""}${query}`,
      { headers: API_HEADERS },
    );
    const info = (await res.json()) as { path: string; download_url: string };
    path = info.path;
    // download_url is .../{owner}/{repo}/{ref}/{path}; recover the ref.
    const prefix = `https://raw.githubusercontent.com/${owner}/${repo}/`;
    resolvedRef =
      info.download_url.startsWith(prefix) && info.download_url.endsWith(`/${path}`)
        ? info.download_url.slice(prefix.length, -(path.length + 1))
        : (ref ?? "HEAD");
  } catch (err) {
    // The API allows 60 unauthenticated requests/hour per IP; the raw host
    // has no such limit, so fall back to the conventional file name.
    if (!(err instanceof SourceError) || !/rate-limiting/.test(err.message)) throw err;
    path = `${dir ? `${dir}/` : ""}README.md`;
    resolvedRef = ref ?? "HEAD";
  }
  const base = fileBase(owner, repo, resolvedRef, path);
  return { markdown: await fetchText(base.raw), base, label: `${owner}/${repo} · ${path}` };
}

async function loadGist(id: string): Promise<RemoteReadme> {
  const res = await fetchChecked(`${GITHUB_API}/gists/${id}`, { headers: API_HEADERS });
  const gist = (await res.json()) as {
    owner?: { login?: string };
    files: Record<string, { filename: string; raw_url: string }>;
  };
  const files = Object.values(gist.files);
  const file = files.find((f) => /\.(md|markdown)$/i.test(f.filename)) ?? files[0];
  if (!file) throw new SourceError("That gist has no files.");
  return {
    markdown: await fetchText(file.raw_url),
    base: { raw: file.raw_url },
    label: `gist${gist.owner?.login ? ` by ${gist.owner.login}` : ""} · ${file.filename}`,
  };
}

/** Fetch the README a share link points at. Throws SourceError. */
export async function loadRemoteReadme(input: string): Promise<RemoteReadme> {
  const source = parseSource(input);
  switch (source.kind) {
    case "file": {
      const base = fileBase(source.owner, source.repo, source.ref, source.path);
      const name = source.path.split("/").at(-1) ?? source.path;
      return {
        markdown: await fetchText(base.raw),
        base,
        label: `${source.owner}/${source.repo} · ${name}`,
      };
    }
    case "repo":
      return loadRepoReadme(source.owner, source.repo, source.ref, source.dir);
    case "gist":
      return loadGist(source.id);
    case "gist-raw":
      return {
        markdown: await fetchText(source.url),
        base: { raw: source.url },
        label: `gist · ${source.url.split("/").at(-1)}`,
      };
  }
}

export type ViewMode = "normal" | "full";

/**
 * A readable share link: the source URL stays legible in the query string,
 * with only the characters that would break parsing escaped.
 */
export function shareUrl(source: string, mode: ViewMode, origin = window.location.origin): string {
  const escaped = source.trim().replace(/[%&#+\s]/g, (c) => encodeURIComponent(c));
  return `${origin}/view?${mode === "full" ? "mode=full&" : ""}url=${escaped}`;
}

/**
 * The source a /view (or /link, or /gh/owner/repo) address points at.
 * `/link?=<url>` (a parameter with no name) is accepted too.
 */
export function sourceFromLocation(location: Pick<Location, "pathname" | "search">): {
  source: string | null;
  mode: ViewMode;
} {
  const params = new URLSearchParams(location.search);
  const mode: ViewMode =
    params.get("mode") === "full" || params.get("view") === "full" ? "full" : "normal";
  const gh = location.pathname.match(/^\/gh\/(.+)$/);
  if (gh?.[1]) return { source: `https://github.com/${gh[1]}`, mode };
  const source = params.get("url") ?? params.get("");
  return { source: source?.trim() || null, mode };
}

/** True when the current address is a link view rather than the editor. */
export function isViewRoute(pathname: string): boolean {
  return pathname === "/view" || pathname === "/link" || pathname.startsWith("/gh/");
}
