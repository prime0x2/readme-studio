import { AlertCircle, BookOpenText, Loader2, Lock } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Toaster } from "sonner";
import type { ShareMeta, SharePayload } from "@/shared/share-protocol";
import { FullscreenView } from "../components/FullscreenView";
import { DownloadButtons, ThemeToggle } from "../components/Toolbar";
import { fetchShareMeta, ShareError, unlockShare } from "../lib/share/api";
import { useResolvedTheme } from "../lib/useRenderedMarkdown";
import type { UiTheme } from "../store/useDocStore";

type State =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | { status: "locked"; meta: ShareMeta; error: string | null; working: boolean }
  | { status: "open"; payload: SharePayload };

const messageOf = (err: unknown) =>
  err instanceof ShareError ? err.message : "Something went wrong opening this link.";

/** The viewer's theme choice, kept apart from the editor's saved document. */
const THEME_KEY = "readmestudio:share-theme";

function useViewerTheme(): [UiTheme, (theme: UiTheme) => void] {
  const [theme, setTheme] = useState<UiTheme>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === "light" || saved === "dark" ? saved : "system";
    } catch {
      return "system";
    }
  });
  const choose = (next: UiTheme) => {
    setTheme(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the page closes.
    }
  };
  return [theme, choose];
}

/**
 * /s/<id>: a password-protected shared document. The password unlocks it in
 * this browser; once open, the page shows the document with a small toolbar
 * (theme, PDF, DOCX, .md).
 */
export function SharePage({ id }: { id: string | null }) {
  const [uiTheme, setUiTheme] = useViewerTheme();
  const theme = useResolvedTheme(uiTheme);
  const [state, setState] = useState<State>(() =>
    id ? { status: "loading" } : { status: "unavailable", message: "This link doesn't exist." },
  );
  const [password, setPassword] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const lockError = state.status === "locked" ? state.error : null;

  // After a wrong password, select what was typed so it can be retyped at once.
  useEffect(() => {
    if (lockError) passwordRef.current?.select();
  }, [lockError]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const existing = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (existing) {
      const previous = existing.content;
      existing.content = "noindex, nofollow";
      return () => {
        existing.content = previous;
      };
    }
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  useEffect(() => {
    if (!id) return;
    let live = true;
    fetchShareMeta(id)
      .then((meta) => {
        if (live) setState({ status: "locked", meta, error: null, working: false });
      })
      .catch((err: unknown) => {
        if (live) setState({ status: "unavailable", message: messageOf(err) });
      });
    return () => {
      live = false;
    };
  }, [id]);

  const title = state.status === "open" ? state.payload.title : null;
  useEffect(() => {
    document.title = title ? `${title} · ReadmeStudio` : "Shared document · ReadmeStudio";
  }, [title]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (state.status !== "locked" || state.working || !id || !password) return;
    const { meta } = state;
    setState({ status: "locked", meta, error: null, working: true });
    try {
      const payload = await unlockShare(id, meta, password);
      setPassword("");
      setState({ status: "open", payload });
    } catch (err) {
      setState({ status: "locked", meta, error: messageOf(err), working: false });
    }
  }

  if (state.status === "open") {
    const { markdown, title, base } = state.payload;
    return (
      <>
        <FullscreenView
          blocks={[{ key: "doc", markdown }]}
          theme={theme}
          base={base ?? undefined}
          actions={
            <>
              <ThemeToggle theme={uiTheme} onChange={setUiTheme} />
              <DownloadButtons markdown={markdown} title={title} base={base ?? undefined} />
            </>
          }
        />
        <Toaster richColors position="bottom-right" theme={theme} />
      </>
    );
  }

  return (
    <main className="flex min-h-full items-start justify-center bg-paper px-4 py-24 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-sm">
          <BookOpenText size={20} />
        </span>

        {state.status === "loading" && (
          <p
            role="status"
            className="mt-5 flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400"
          >
            <Loader2 size={15} className="animate-spin" /> Opening link…
          </p>
        )}

        {state.status === "unavailable" && (
          <>
            <p
              role="alert"
              className="mt-5 flex items-center gap-2 font-medium text-red-700 dark:text-red-400"
            >
              <AlertCircle size={16} /> {state.message}
            </p>
            <a
              href="/"
              className="mt-4 inline-block text-sm text-accent-700 hover:underline dark:text-accent-400"
            >
              Write your own with ReadmeStudio →
            </a>
          </>
        )}

        {state.status === "locked" && (
          <form onSubmit={(event) => void unlock(event)} className="mt-5">
            <h1 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
              <Lock size={17} className="text-accent-600 dark:text-accent-400" />
              Protected document
            </h1>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Enter the password you were given.
            </p>
            <input
              ref={passwordRef}
              type="password"
              aria-label="Password"
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? errorId : undefined}
              autoComplete="off"
              // biome-ignore lint/a11y/noAutofocus: the page exists to take this input
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-4 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-accent-400 focus:ring-2 focus:ring-accent-200 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:ring-accent-900"
            />
            {state.error && (
              <p id={errorId} role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                {state.error}
              </p>
            )}
            <button
              type="submit"
              disabled={state.working || !password}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-700 disabled:opacity-50"
            >
              {state.working && <Loader2 size={14} className="animate-spin" />}
              {state.working ? "Unlocking…" : "Open"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
