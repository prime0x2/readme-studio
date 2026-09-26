import { Check, Copy, Maximize2 } from "lucide-react";
import { useMemo, useState } from "react";
import { assembleMarkdown, type PreviewTheme } from "@/shared";
import { useSectionBlocks } from "../lib/useSectionBlocks";
import { useDocStore } from "../store/useDocStore";
import { MarkdownArticle } from "./MarkdownArticle";

export function PreviewPane({
  isDark,
  onFullscreen,
}: {
  isDark: boolean;
  onFullscreen: () => void;
}) {
  const sections = useDocStore((s) => s.sections);
  const selectSection = useDocStore((s) => s.selectSection);
  const documentBase = useDocStore((s) => s.documentBase);
  const blocks = useSectionBlocks(selectSection);

  const [tab, setTab] = useState<"preview" | "raw">("preview");
  const [copied, setCopied] = useState(false);

  // The preview follows the app theme; exports always render light.
  const previewTheme: PreviewTheme = isDark ? "dark" : "light";

  const raw = useMemo(() => assembleMarkdown(sections), [sections]);

  async function copyRaw() {
    await navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs font-medium transition-colors ${
      active
        ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100"
        : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
    }`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-stone-200 px-4 py-2 dark:border-stone-800">
        <div className="flex rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800">
          <button
            type="button"
            className={tabClass(tab === "preview")}
            onClick={() => setTab("preview")}
          >
            Preview
          </button>
          <button type="button" className={tabClass(tab === "raw")} onClick={() => setTab("raw")}>
            Raw
          </button>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onFullscreen}
          title="Full screen preview (Esc to exit)"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
        >
          <Maximize2 size={13} />
          Full screen
        </button>
        {tab === "raw" && (
          <button
            type="button"
            onClick={copyRaw}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-stone-100/60 p-4 dark:bg-stone-950">
        {tab === "preview" ? (
          <MarkdownArticle
            className="rounded-xl border border-stone-200 px-8 py-7 shadow-sm dark:border-stone-800"
            theme={previewTheme}
            base={documentBase ?? undefined}
            blocks={blocks}
            empty={
              <p style={{ color: "var(--md-fg-muted)" }}>Your README preview will appear here.</p>
            }
          />
        ) : (
          <pre className="rounded-xl border border-stone-200 bg-white px-6 py-5 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-stone-800 shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200">
            {raw}
          </pre>
        )}
      </div>
    </div>
  );
}
