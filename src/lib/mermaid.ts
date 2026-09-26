import { DIAGRAM_SANITIZE_CONFIG, type DiagramRenderer, type PreviewTheme } from "@/shared";

/*
 * Live-preview Mermaid rendering. The library is large (~2 MB), so it is
 * only fetched the first time a document actually contains a diagram.
 * Rendering is best effort: any failure shows the diagram as a code block
 * (the pipeline's fallback) rather than failing the section.
 */

type MermaidApi = typeof import("mermaid").default;
type Purifier = typeof import("dompurify").default;

let loading: Promise<{ mermaid: MermaidApi; purify: Purifier }> | null = null;

function load() {
  loading ??= Promise.all([import("mermaid"), import("dompurify")])
    .then(([m, p]) => ({ mermaid: m.default, purify: p.default }))
    .catch((err: unknown) => {
      // A flaky network, or chunk hashes changed by a deploy. Browsers
      // remember a failed module fetch for the page's lifetime, so this
      // mostly takes a reload to recover; until then every render falls
      // back to code instead of failing its section.
      loading = null;
      throw err;
    });
  return loading;
}

// Mermaid's config is global and a render depends on it, so renders run
// one at a time; several preview sections may ask concurrently.
let queue: Promise<unknown> = Promise.resolve();
let nextId = 0;
const cache = new Map<string, string | null>();

const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "Noto Sans Bengali Variable", Helvetica, Arial, sans-serif';

/** A transient failure: show code now, but don't remember the result. */
const RETRY = Symbol("retry");

/**
 * "print" is the light preview under its own cache key: the printed copy
 * sits on the page next to the preview, and a shared SVG would share its
 * element ids, so the print's arrowheads would point at the preview's
 * <marker>s, which printing hides.
 * "export" renders for rasterizing into DOCX: light theme, and labels as SVG
 * <text> instead of HTML in <foreignObject> — browsers refuse to read back
 * a canvas an SVG with foreignObject was drawn on.
 */
type RenderMode = PreviewTheme | "print" | "export";

async function render(code: string, mode: RenderMode): Promise<string | null | typeof RETRY> {
  let libs: Awaited<ReturnType<typeof load>>;
  try {
    libs = await load();
  } catch {
    return RETRY;
  }
  const { mermaid, purify } = libs;
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: mode === "dark" ? "dark" : "default",
      fontFamily: FONT_FAMILY,
      htmlLabels: mode !== "export",
      flowchart: { htmlLabels: mode !== "export" },
    });
    if (!(await mermaid.parse(code, { suppressErrors: true }))) return null;
    const { svg } = await mermaid.render(`rs-mermaid-${nextId++}`, code);
    // Defense in depth on top of Mermaid's strict mode: shared links render
    // READMEs written by strangers, so the SVG is scrubbed again here.
    return purify.sanitize(svg, DIAGRAM_SANITIZE_CONFIG);
  } catch {
    return null;
  }
}

/** Render through the shared queue and cache; RETRY results aren't cached. */
function queued(code: string, mode: RenderMode, signal?: AbortSignal): Promise<string | null> {
  const key = `${mode}\n${code}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  const result = queue.then(() => (signal?.aborted ? RETRY : render(code, mode)));
  queue = result.catch(() => undefined);
  return result.then((svg) => {
    if (svg === RETRY) return null;
    if (cache.size > 200) cache.clear();
    cache.set(key, svg);
    return svg;
  });
}

/**
 * A cached, serialized Mermaid renderer bound to the preview theme. Once
 * `signal` aborts (the preview moved on to newer text), renders still
 * waiting in the queue are skipped instead of run.
 */
export function mermaidRenderer(theme: PreviewTheme, signal?: AbortSignal): DiagramRenderer {
  return (code) => queued(code, theme, signal);
}

/** Light-theme renderer for the printed (PDF) copy of the document. */
export function mermaidPrintRenderer(): DiagramRenderer {
  return (code) => queued(code, "print");
}

/** A diagram as SVG suited to rasterizing (DOCX export), or null. */
export function renderMermaidForExport(code: string): Promise<string | null> {
  return queued(code, "export");
}
