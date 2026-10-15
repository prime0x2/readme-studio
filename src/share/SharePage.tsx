import { AlertCircle, BookOpenText, Loader2, Lock } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { ShareMeta, SharePayload } from "@/shared/share-protocol";
import { MarkdownArticle } from "../components/MarkdownArticle";
import { fetchShareMeta, ShareError, unlockShare } from "../lib/share/api";
import { useResolvedTheme } from "../lib/useRenderedMarkdown";

type State =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | { status: "locked"; meta: ShareMeta; error: string | null; working: boolean }
  | { status: "open"; payload: SharePayload };

const messageOf = (err: unknown) =>
  err instanceof ShareError ? err.message : "Something went wrong opening this link.";

/**
 * /s/<id>: a password-protected shared document. The password unlocks it in
 * this browser; once open, the page shows the document and nothing else.
 */
export function SharePage({ id }: { id: string | null }) {
  const theme = useResolvedTheme("system");
  const [state, setState] = useState<State>(() =>
    id ? { status: "loading" } : { status: "unavailable", message: "This link doesn't exist." },
  );
  const [password, setPassword] = useState("");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
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
    return (
      <div className={`min-h-full ${theme === "dark" ? "bg-[#0d1117]" : "bg-white"}`}>
        <MarkdownArticle
          blocks={[{ key: "doc", markdown: state.payload.markdown }]}
          theme={theme}
          base={state.payload.base ?? undefined}
          className="mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-14"
        />
      </div>
    );
  }

  return (
    <main className="flex min-h-full items-start justify-center bg-paper px-4 py-24 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-sm">
          <BookOpenText size={20} />
        </span>

        {state.status === "loading" && (
          <p className="mt-5 flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
            <Loader2 size={15} className="animate-spin" /> Opening link…
          </p>
        )}

        {state.status === "unavailable" && (
          <>
            <p className="mt-5 flex items-center gap-2 font-medium text-red-700 dark:text-red-400">
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
              type="password"
              aria-label="Password"
              autoComplete="off"
              // biome-ignore lint/a11y/noAutofocus: the page exists to take this input
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-4 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-accent-400 focus:ring-2 focus:ring-accent-200 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:ring-accent-900"
            />
            {state.error && (
              <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
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
