import { type FormEvent, useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";
import type { ShareMeta, SharePayload } from "@/shared/share-protocol";
import { FullscreenView } from "../components/FullscreenView";
import { DownloadButtons, ThemeToggle } from "../components/Toolbar";
import { fetchShareMeta, ShareError, unlockShare } from "../lib/share/api";
import { useResolvedTheme } from "../lib/useRenderedMarkdown";
import type { UiTheme } from "../store/useDocStore";
import { LoadingSheet, LockedSheet, UnavailableSheet } from "./LockScreen";

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
  const [attempt, setAttempt] = useState(0);
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
      setAttempt((n) => n + 1);
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

  if (state.status === "loading") return <LoadingSheet />;
  if (state.status === "unavailable") return <UnavailableSheet message={state.message} />;
  return (
    <LockedSheet
      expiresAt={state.meta.expiresAt}
      password={password}
      onPasswordChange={setPassword}
      onSubmit={(event) => void unlock(event)}
      working={state.working}
      error={state.error}
      attempt={attempt}
      inputRef={passwordRef}
    />
  );
}
