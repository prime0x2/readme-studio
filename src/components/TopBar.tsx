import {
  BookOpenText,
  Download,
  FileText,
  Link2,
  Loader2,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Sun,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { assembleMarkdown, extractTitle } from "@/shared";
import {
  downloadMarkdownFile,
  type ExportFormat,
  PDF_PRINT_HINT,
  requestExport,
} from "../lib/exports";
import { type UiTheme, useDocStore } from "../store/useDocStore";

const THEME_CYCLE: Record<UiTheme, UiTheme> = { light: "dark", dark: "system", system: "light" };
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

export function TopBar({
  onToggleSidebar,
  sidebarVisible,
}: {
  onToggleSidebar: () => void;
  sidebarVisible: boolean;
}) {
  const sections = useDocStore((s) => s.sections);
  const uiTheme = useDocStore((s) => s.uiTheme);
  const setUiTheme = useDocStore((s) => s.setUiTheme);
  const resetDocument = useDocStore((s) => s.resetDocument);
  const documentBase = useDocStore((s) => s.documentBase);

  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const markdown = useMemo(() => assembleMarkdown(sections), [sections]);
  const title = useMemo(() => extractTitle(markdown), [markdown]);

  async function handleExport(format: ExportFormat) {
    if (exporting) return;
    if (sections.length === 0) {
      toast.warning("Nothing to export yet — add a section first.");
      return;
    }
    setExporting(format);
    try {
      if (format === "pdf") toast.info(PDF_PRINT_HINT, { duration: 12_000 });
      await requestExport(format, markdown, title, documentBase ?? undefined);
      if (format === "docx") toast.success("DOCX downloaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.", {
        action: { label: "Retry", onClick: () => void handleExport(format) },
      });
    } finally {
      setExporting(null);
    }
  }

  function handleReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    resetDocument();
    setConfirmReset(false);
    toast.success("Document reset to a fresh start.");
  }

  const ThemeIcon = THEME_ICON[uiTheme];

  const exportButton = (format: ExportFormat, label: string) => (
    <button
      type="button"
      onClick={() => void handleExport(format)}
      disabled={exporting !== null}
      className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-accent-300 hover:text-accent-800 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-accent-700 dark:hover:text-accent-300"
    >
      {exporting === format ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <FileText size={13} />
      )}
      {label}
    </button>
  );

  return (
    <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900">
      <button
        type="button"
        onClick={onToggleSidebar}
        title={`${sidebarVisible ? "Hide" : "Show"} sections (Ctrl/⌘+\\)`}
        className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
        aria-label={`${sidebarVisible ? "Hide" : "Show"} sections sidebar`}
        aria-expanded={sidebarVisible}
      >
        {sidebarVisible ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
      </button>

      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-sm">
          <BookOpenText size={17} />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          Readme<em className="text-accent-600 not-italic italic dark:text-accent-400">Studio</em>
        </span>
      </div>

      {title && (
        <span className="hidden min-w-0 truncate font-mono text-xs text-stone-400 md:block dark:text-stone-500">
          / {title}
        </span>
      )}

      <div className="flex-1" />

      <a
        href="/view"
        title="Preview (and share) a README from a GitHub link"
        className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800 sm:flex dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
      >
        <Link2 size={13} />
        Open from GitHub
      </a>

      <button
        type="button"
        onClick={() => setUiTheme(THEME_CYCLE[uiTheme])}
        title={`Theme: ${uiTheme}`}
        className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
      >
        <ThemeIcon size={16} />
      </button>

      <button
        type="button"
        onClick={handleReset}
        title="Start over with a fresh document"
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
          confirmReset
            ? "bg-red-600 text-white hover:bg-red-700"
            : "text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800"
        }`}
      >
        <RotateCcw size={13} />
        {confirmReset ? "Really reset?" : "Reset"}
      </button>

      <div className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />

      {exportButton("pdf", "PDF")}
      {exportButton("docx", "DOCX")}

      <button
        type="button"
        onClick={() => {
          if (sections.length === 0) {
            toast.warning("Nothing to download yet — add a section first.");
            return;
          }
          downloadMarkdownFile(markdown);
          toast.success("README.md downloaded.");
        }}
        className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-accent-700"
      >
        <Download size={13} />
        README.md
      </button>
    </header>
  );
}
