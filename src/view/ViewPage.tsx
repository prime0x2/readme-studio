import {
  AlertCircle,
  BookOpenText,
  Check,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Maximize2,
  Monitor,
  Moon,
  PencilLine,
  Sun,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { extractTitle, splitIntoSections } from "@/shared";
import { FullscreenView } from "../components/FullscreenView";
import { MarkdownArticle } from "../components/MarkdownArticle";
import {
  downloadMarkdownFile,
  type ExportFormat,
  PDF_PRINT_HINT,
  requestExport,
} from "../lib/exports";
import {
  loadRemoteReadme,
  type RemoteReadme,
  SourceError,
  shareUrl,
  sourceFromLocation,
  type ViewMode,
} from "../lib/remoteReadme";
import { useResolvedTheme } from "../lib/useRenderedMarkdown";
import { lastSaveSucceeded, type UiTheme, useDocStore } from "../store/useDocStore";

const THEME_CYCLE: Record<UiTheme, UiTheme> = { light: "dark", dark: "system", system: "light" };
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

const EXAMPLES = [
  "https://github.com/prime0x2/prime0x2",
  "https://github.com/octokatherine/readme.so/blob/main/README.md",
];

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; readme: RemoteReadme };

function useThemeClass(): "light" | "dark" {
  const uiTheme = useDocStore((s) => s.uiTheme);
  const resolved = useResolvedTheme(uiTheme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);
  return resolved;
}

function ToolbarButton({
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

function ThemeButton() {
  const uiTheme = useDocStore((s) => s.uiTheme);
  const setUiTheme = useDocStore((s) => s.setUiTheme);
  const Icon = THEME_ICON[uiTheme];
  return (
    <ToolbarButton onClick={() => setUiTheme(THEME_CYCLE[uiTheme])} title={`Theme: ${uiTheme}`}>
      <Icon size={14} />
    </ToolbarButton>
  );
}

async function copyToClipboard(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied.`);
  } catch {
    toast.error("Couldn't copy. Your browser blocked clipboard access.");
  }
}

/** "Share" with a two-item menu: the normal link and the full-screen link. */
function ShareMenu({ source }: { source: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const item = (mode: ViewMode, label: string, hint: string) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        void copyToClipboard(shareUrl(source, mode), "Link");
      }}
      className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
    >
      <span className="text-sm font-medium text-stone-800 dark:text-stone-100">{label}</span>
      <span className="text-xs text-stone-500 dark:text-stone-400">{hint}</span>
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton onClick={() => setOpen((o) => !o)} title="Copy a link to this preview">
        <Link2 size={14} />
        <span className="hidden sm:inline">Share</span>
      </ToolbarButton>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-stone-200 bg-white p-1 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          {item("normal", "Copy link", "Opens this preview with the toolbar")}
          {item("full", "Copy full-screen link", "Opens straight into the clean reading view")}
        </div>
      )}
    </div>
  );
}

function SourceForm({ initial = "", autoFocus }: { initial?: string; autoFocus?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="flex w-full gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) window.location.assign(shareUrl(value, "normal"));
      }}
    >
      <input
        // biome-ignore lint/a11y/noAutofocus: the landing page exists to take this input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://github.com/owner/repo"
        aria-label="GitHub README link"
        className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-accent-400 focus:ring-2 focus:ring-accent-200 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:ring-accent-900"
      />
      <button
        type="submit"
        className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-700"
      >
        Preview
      </button>
    </form>
  );
}

function Landing() {
  return (
    <main className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-16">
      <div className="w-full max-w-xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          Preview a README from GitHub
        </h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Paste a repository, a file on github.com, a raw.githubusercontent.com URL, or a gist.
          You'll get a link you can share, and PDF/DOCX export.
        </p>
        <div className="mt-6">
          <SourceForm autoFocus />
        </div>
        <div className="mt-6 text-xs text-stone-500 dark:text-stone-400">
          <p className="mb-1.5 font-medium">Examples</p>
          <ul className="flex flex-col gap-1">
            {EXAMPLES.map((example) => (
              <li key={example}>
                <a
                  href={shareUrl(example, "normal")}
                  className="font-mono text-accent-700 hover:underline dark:text-accent-400"
                >
                  {example.replace("https://", "")}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}

/**
 * /view?url=<github link>[&mode=full] — a read-only preview of a README
 * fetched from GitHub, shareable as a link. Also /gh/<owner>/<repo>.
 */
export function ViewPage() {
  const theme = useThemeClass();
  const [{ source, mode: initialMode }] = useState(() => sourceFromLocation(window.location));
  const [mode, setModeState] = useState<ViewMode>(initialMode);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  useEffect(() => {
    if (!source) return;
    let live = true;
    loadRemoteReadme(source)
      .then((readme) => live && setLoad({ status: "ready", readme }))
      .catch((err: unknown) => {
        if (!live) return;
        const message =
          err instanceof SourceError ? err.message : "Something went wrong loading that README.";
        setLoad({ status: "error", message });
      });
    return () => {
      live = false;
    };
  }, [source]);

  const readme = load.status === "ready" ? load.readme : null;
  const title = readme ? (extractTitle(readme.markdown) ?? readme.label) : null;

  useEffect(() => {
    document.title = title ? `${title} · ReadmeStudio` : "Preview a README · ReadmeStudio";
  }, [title]);

  function setMode(next: ViewMode) {
    if (source) window.history.replaceState(null, "", shareUrl(source, next));
    setModeState(next);
  }

  async function handleExport(format: ExportFormat) {
    if (!readme || exporting) return;
    setExporting(format);
    try {
      if (format === "pdf") toast.info(PDF_PRINT_HINT, { duration: 12_000 });
      await requestExport(format, readme.markdown, title, readme.base);
      if (format === "docx") toast.success("DOCX downloaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  const sectionCount = useDocStore((s) => s.sections.length);
  const importDocument = useDocStore((s) => s.importDocument);
  const [confirmImport, setConfirmImport] = useState(false);

  function editCopy() {
    if (!readme) return;
    // Replacing a non-empty document takes a second click; the old
    // sections stay restorable from "Deleted sections" either way.
    if (sectionCount > 0 && !confirmImport) {
      setConfirmImport(true);
      setTimeout(() => setConfirmImport(false), 4000);
      return;
    }
    importDocument(splitIntoSections(readme.markdown), readme.base);
    if (!lastSaveSucceeded()) {
      // The editor loads from storage; navigating would show the old doc.
      toast.error(
        "Couldn't save the copy: browser storage is full. Open the editor and clear “Deleted sections”, then try again.",
        { duration: 15_000 },
      );
      return;
    }
    window.location.assign("/");
  }

  const blocks = readme ? [{ key: "doc", markdown: readme.markdown }] : [];
  const toaster = <Toaster richColors position="bottom-right" theme={theme} />;

  if (readme && mode === "full") {
    return (
      <>
        <FullscreenView
          blocks={blocks}
          theme={theme}
          base={readme.base}
          onExit={() => setMode("normal")}
          actions={
            <>
              <ToolbarButton
                onClick={() => source && void copyToClipboard(shareUrl(source, "full"), "Link")}
                title="Copy a link to this full-screen view"
              >
                <Link2 size={13} />
                <span className="hidden sm:inline">Copy link</span>
              </ToolbarButton>
              <ThemeButton />
            </>
          }
        />
        {toaster}
      </>
    );
  }

  const exportLabel = (format: ExportFormat, label: string) => (
    <ToolbarButton
      onClick={() => void handleExport(format)}
      disabled={!readme || exporting !== null}
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
    <div className="flex h-full flex-col bg-paper text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900">
        <a href="/" className="flex shrink-0 items-center gap-2.5" title="Open the editor">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-sm">
            <BookOpenText size={17} />
          </span>
          <span className="hidden font-display text-lg font-semibold tracking-tight text-stone-900 sm:inline dark:text-stone-100">
            Readme<em className="text-accent-600 not-italic italic dark:text-accent-400">Studio</em>
          </span>
        </a>
        {readme && (
          <a
            href={readme.base.web ?? readme.base.raw}
            target="_blank"
            rel="noopener noreferrer"
            title="View the source on GitHub"
            className="flex min-w-0 items-center gap-1 truncate font-mono text-xs text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
          >
            <span className="truncate">/ {readme.label}</span>
            <ExternalLink size={11} className="shrink-0" />
          </a>
        )}
        <div className="flex-1" />
        {readme && source && (
          <>
            <ShareMenu source={source} />
            <ToolbarButton onClick={() => setMode("full")} title="Full screen (Esc to exit)">
              <Maximize2 size={13} />
              <span className="hidden sm:inline">Full screen</span>
            </ToolbarButton>
          </>
        )}
        <ThemeButton />
        {readme && (
          <>
            <div className="mx-1 hidden h-5 w-px bg-stone-200 md:block dark:bg-stone-700" />
            <span className="hidden items-center gap-1 md:flex">
              {exportLabel("pdf", "PDF")}
              {exportLabel("docx", "DOCX")}
              <ToolbarButton
                onClick={() =>
                  downloadMarkdownFile(readme.markdown, readme.base.raw.split("/").at(-1))
                }
                title="Download the markdown file"
              >
                <Download size={13} />
                .md
              </ToolbarButton>
            </span>
            <ToolbarButton
              primary
              onClick={editCopy}
              title="Open a copy in the editor, split into sections (your current document moves to Deleted sections)"
            >
              <PencilLine size={13} />
              {confirmImport ? "Replace current doc?" : "Edit a copy"}
            </ToolbarButton>
          </>
        )}
      </header>

      {!source ? (
        <Landing />
      ) : load.status === "loading" ? (
        <main className="flex flex-1 items-center justify-center gap-2 text-sm text-stone-500">
          <Loader2 size={16} className="animate-spin" /> Loading README…
        </main>
      ) : load.status === "error" ? (
        <main className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-16">
          <div className="w-full max-w-xl rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <p className="flex items-center gap-2 font-medium text-red-700 dark:text-red-400">
              <AlertCircle size={16} /> Couldn't load that README
            </p>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{load.message}</p>
            <p className="mt-3 truncate font-mono text-xs text-stone-400">{source}</p>
            <div className="mt-5">
              <SourceForm initial={source} />
            </div>
          </div>
        </main>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-8">
          <MarkdownArticle
            blocks={blocks}
            theme={theme}
            base={load.readme.base}
            className="mx-auto max-w-[980px] rounded-xl border border-stone-200 px-5 py-6 shadow-sm sm:px-10 sm:py-9 dark:border-stone-800"
          />
          <p className="mx-auto mt-4 flex max-w-[980px] items-center justify-center gap-1.5 text-xs text-stone-400">
            <Check size={12} /> Rendered from GitHub by ReadmeStudio.{" "}
            <a href="/" className="text-accent-700 hover:underline dark:text-accent-400">
              Write your own README →
            </a>
          </p>
        </main>
      )}
      {toaster}
    </div>
  );
}
