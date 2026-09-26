import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { EditorPane } from "./components/EditorPane";
import { FullscreenView } from "./components/FullscreenView";
import { PreviewPane } from "./components/PreviewPane";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { useMediaQuery } from "./lib/useMediaQuery";
import { useResolvedTheme } from "./lib/useRenderedMarkdown";
import { useSectionBlocks } from "./lib/useSectionBlocks";
import { STORAGE_FAILED_EVENT, useDocStore } from "./store/useDocStore";

function useStorageWarning() {
  useEffect(() => {
    try {
      localStorage.setItem("readmestudio:probe", "1");
      localStorage.removeItem("readmestudio:probe");
    } catch {
      toast.warning("Storage is unavailable — your work won't persist after this tab closes.", {
        duration: 10_000,
      });
    }
    // Later saves can fail too (quota full): say so once, not per keystroke.
    let warned = false;
    const onSaveFailed = () => {
      if (warned) return;
      warned = true;
      toast.error(
        "Browser storage is full — recent changes aren't being saved. Clear “Deleted sections” to free space.",
        { duration: 15_000 },
      );
    };
    window.addEventListener(STORAGE_FAILED_EVENT, onSaveFailed);
    return () => window.removeEventListener(STORAGE_FAILED_EVENT, onSaveFailed);
  }, []);
}

/** Full-screen preview of the document; its blocks exist only while open. */
function EditorFullscreen({ theme, onExit }: { theme: "light" | "dark"; onExit: () => void }) {
  const blocks = useSectionBlocks();
  const documentBase = useDocStore((s) => s.documentBase);
  return (
    <FullscreenView
      blocks={blocks}
      theme={theme}
      base={documentBase ?? undefined}
      onExit={onExit}
    />
  );
}

export default function App() {
  const uiTheme = useDocStore((s) => s.uiTheme);
  const previewRatio = useDocStore((s) => s.previewRatio);
  const setPreviewRatio = useDocStore((s) => s.setPreviewRatio);
  const resolved = useResolvedTheme(uiTheme);
  const isDark = resolved === "dark";

  const sidebarCollapsed = useDocStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useDocStore((s) => s.toggleSidebarCollapsed);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"editor" | "preview">("editor");
  const [resizing, setResizing] = useState(false);
  const panesRef = useRef<HTMLDivElement>(null);

  useStorageWarning();

  // Desktop collapses the column; below lg the same control opens the drawer.
  const toggleSidebar = useCallback(() => {
    if (isDesktop) toggleSidebarCollapsed();
    else setSidebarOpen((open) => !open);
  }, [isDesktop, toggleSidebarCollapsed]);

  useEffect(() => {
    // Ctrl/⌘+\ (Ctrl/⌘+B is bold in the editor). Matching the physical key
    // too keeps it working on layouts where "\" needs a modifier.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key === "\\" || event.code === "Backslash") {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  // Drag the divider to grow/shrink the preview; the sections sidebar
  // sits outside this container and keeps its fixed width.
  function startResize(event: React.PointerEvent) {
    event.preventDefault();
    setResizing(true);
    const onMove = (ev: PointerEvent) => {
      const rect = panesRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      setPreviewRatio((rect.right - ev.clientX) / rect.width);
    };
    const stop = () => {
      setResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
  }

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const paneTab = (pane: "editor" | "preview", label: string) => (
    <button
      type="button"
      onClick={() => setMobilePane(pane)}
      className={`flex-1 rounded-md px-3 py-1 text-xs font-medium ${
        mobilePane === pane
          ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100"
          : "text-stone-500 dark:text-stone-400"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col bg-paper text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <TopBar
        onToggleSidebar={toggleSidebar}
        sidebarVisible={isDesktop ? !sidebarCollapsed : sidebarOpen}
      />

      {/* Mobile/tablet pane switcher */}
      <div className="flex gap-1 border-b border-stone-200 bg-stone-100 p-1 lg:hidden dark:border-stone-800 dark:bg-stone-900">
        {paneTab("editor", "Editor")}
        {paneTab("preview", "Preview")}
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar — fixed column on desktop, drawer below lg */}
        <aside
          inert={isDesktop ? sidebarCollapsed : !sidebarOpen}
          className={`absolute inset-y-0 left-0 z-20 w-72 shrink-0 transform overflow-hidden border-r border-stone-200 bg-stone-50 transition-[transform,width] duration-200 lg:static lg:translate-x-0 dark:border-stone-800 dark:bg-stone-900 ${
            sidebarOpen ? "translate-x-0 shadow-xl lg:shadow-none" : "-translate-x-full"
          } ${sidebarCollapsed ? "lg:w-0 lg:border-r-0" : ""}`}
        >
          {/* Fixed-width inner box so content doesn't reflow while the column animates */}
          <div className="h-full w-72">
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </aside>
        {sidebarOpen && (
          // biome-ignore lint/a11y/noStaticElementInteractions: scrim dismiss
          <div
            className="absolute inset-0 z-10 bg-black/20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            onKeyDown={() => setSidebarOpen(false)}
          />
        )}

        <div
          ref={panesRef}
          className={`flex min-h-0 min-w-0 flex-1 ${resizing ? "select-none" : ""}`}
        >
          <main
            className={`min-h-0 min-w-0 flex-1 ${
              mobilePane === "editor" ? "block" : "hidden lg:block"
            }`}
          >
            <EditorPane isDark={isDark} />
          </main>

          <div
            onPointerDown={startResize}
            title="Drag to resize the preview"
            className={`hidden w-1.5 shrink-0 cursor-col-resize touch-none border-l border-stone-200 transition-colors lg:block dark:border-stone-800 ${
              resizing ? "bg-accent-400/50" : "hover:bg-accent-400/30"
            }`}
          />

          <section
            style={{ "--preview-w": `${previewRatio * 100}%` } as React.CSSProperties}
            className={`min-h-0 min-w-0 flex-1 lg:w-(--preview-w) lg:flex-none ${
              mobilePane === "preview" ? "block" : "hidden lg:block"
            }`}
          >
            <PreviewPane isDark={isDark} onFullscreen={() => setFullscreen(true)} />
          </section>
        </div>
      </div>

      {fullscreen && <EditorFullscreen theme={resolved} onExit={() => setFullscreen(false)} />}

      <Toaster richColors position="bottom-right" theme={resolved} />
    </div>
  );
}
