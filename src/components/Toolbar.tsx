import { Download, FileText, Loader2, Monitor, Moon, Sun } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import type { DocumentBase } from "@/shared";
import {
  downloadMarkdownFile,
  type ExportFormat,
  PDF_PRINT_HINT,
  requestExport,
} from "../lib/exports";
import { nextTheme } from "../lib/theme";
import { useMediaQuery } from "../lib/useMediaQuery";
import type { UiTheme } from "../store/useDocStore";

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

/** The small buttons of the read-only pages' toolbars (GitHub preview, shared links). */
export function ToolbarButton({
  onClick,
  title,
  children,
  disabled,
  primary,
}: {
  onClick: () => void;
  title?: string;
  children: ReactNode;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={
        primary
          ? "flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-accent-700 disabled:opacity-50"
          : "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
      }
    >
      {children}
    </button>
  );
}

/** Flips the theme on every click; see nextTheme. */
export function ThemeToggle({
  theme,
  onChange,
}: {
  theme: UiTheme;
  onChange: (theme: UiTheme) => void;
}) {
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const Icon = THEME_ICON[theme];
  return (
    <ToolbarButton onClick={() => onChange(nextTheme(theme, systemDark))} title={`Theme: ${theme}`}>
      <Icon size={14} />
    </ToolbarButton>
  );
}

/** PDF, DOCX and .md downloads of a read-only document, all built in the browser. */
export function DownloadButtons({
  markdown,
  title,
  base,
  filename = "README.md",
}: {
  markdown: string;
  title: string | null;
  base?: DocumentBase;
  filename?: string;
}) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  async function download(format: ExportFormat) {
    if (exporting) return;
    setExporting(format);
    try {
      if (format === "pdf") toast.info(PDF_PRINT_HINT, { duration: 12_000 });
      await requestExport(format, markdown, title, base);
      if (format === "docx") toast.success("DOCX downloaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  const exportButton = (format: ExportFormat, label: string) => (
    <ToolbarButton
      onClick={() => void download(format)}
      disabled={exporting !== null}
      title={`Download as ${label}`}
    >
      {exporting === format ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <FileText size={13} />
      )}
      {label}
    </ToolbarButton>
  );

  return (
    <>
      {exportButton("pdf", "PDF")}
      {exportButton("docx", "DOCX")}
      <ToolbarButton
        onClick={() => downloadMarkdownFile(markdown, filename)}
        title="Download the Markdown file"
      >
        <Download size={13} />
        .md
      </ToolbarButton>
    </>
  );
}
