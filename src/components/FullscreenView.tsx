import { Minimize2 } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import type { DocumentBase, PreviewTheme } from "@/shared";
import { type ArticleBlock, MarkdownArticle } from "./MarkdownArticle";

/**
 * The document alone, up to 80rem (max-w-7xl) wide, filling the browser
 * window (not the OS screen — no Fullscreen API). Exits on Esc or the
 * exit button.
 */
export function FullscreenView({
  blocks,
  theme,
  base,
  onExit,
  actions,
}: {
  blocks: ArticleBlock[];
  theme: PreviewTheme;
  base?: DocumentBase;
  onExit: () => void;
  /** Extra toolbar buttons shown before the exit button. */
  actions?: ReactNode;
}) {
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExitRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const isDark = theme === "dark";

  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto ${isDark ? "bg-[#0d1117]" : "bg-white"}`}
      role="dialog"
      aria-modal="true"
      aria-label="Full screen preview"
    >
      <div className="sticky top-0 z-10 flex justify-end gap-1 p-3">
        <div
          className={`flex items-center gap-1 rounded-xl border p-1 shadow-sm backdrop-blur ${
            isDark ? "border-stone-800 bg-stone-900/80" : "border-stone-200 bg-white/80"
          }`}
        >
          {actions}
          <button
            type="button"
            onClick={onExit}
            title="Exit full screen (Esc)"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
              isDark
                ? "text-stone-300 hover:bg-stone-800 hover:text-stone-100"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            }`}
          >
            <Minimize2 size={13} />
            Exit
          </button>
        </div>
      </div>
      <MarkdownArticle
        blocks={blocks}
        theme={theme}
        base={base}
        className="mx-auto max-w-7xl px-4 pb-16 sm:px-8"
        empty={<p style={{ color: "var(--md-fg-muted)" }}>Nothing to preview yet.</p>}
      />
    </div>
  );
}
