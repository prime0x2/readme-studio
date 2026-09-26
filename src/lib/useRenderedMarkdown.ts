import { useEffect, useState } from "react";
import { type DocumentBase, type PreviewTheme, renderMarkdown } from "@/shared";
import { mermaidRenderer } from "./mermaid";

/** Debounced async markdown -> sanitized HTML for the live preview. */
export function useRenderedMarkdown(
  markdown: string,
  theme: PreviewTheme,
  base?: DocumentBase,
): string {
  const [html, setHtml] = useState("");

  useEffect(() => {
    // Aborted when newer text arrives: the result is dropped, and diagram
    // renders still queued for this version are skipped.
    const stale = new AbortController();
    const timer = setTimeout(() => {
      const renderDiagram = mermaidRenderer(theme, stale.signal);
      renderMarkdown(markdown, { theme, base, renderDiagram })
        .then((rendered) => {
          if (!stale.signal.aborted) setHtml(rendered);
        })
        .catch(() => {
          if (!stale.signal.aborted) setHtml("<p>Preview failed to render.</p>");
        });
    }, 150);
    return () => {
      stale.abort();
      clearTimeout(timer);
    };
  }, [markdown, theme, base]);

  return html;
}

/** Resolves "system" against the OS preference, reactively. */
export function useResolvedTheme(uiTheme: "light" | "dark" | "system"): "light" | "dark" {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  if (uiTheme === "system") return systemDark ? "dark" : "light";
  return uiTheme;
}
