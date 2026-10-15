import { Check, Copy, Loader2, Lock, X } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import type { DocumentBase } from "@/shared";
import { DEFAULT_SHARE_TTL_DAYS, SHARE_TTL_DAYS, type ShareTtlDays } from "@/shared/share-protocol";
import { checkShareInput, createShareLink, ShareError } from "../lib/share/api";

type Phase =
  | { step: "form"; error: string | null }
  | { step: "working" }
  | { step: "done"; url: string; expiresAt: number };

const INPUT =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-accent-400 focus:ring-2 focus:ring-accent-200 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:ring-accent-900";
const LABEL = "mb-1.5 block text-xs font-medium text-stone-600 dark:text-stone-400";

/**
 * "Share with a password": encrypts the document in the browser, uploads the
 * ciphertext and shows the short link. The password is never sent.
 */
export function ShareDialog({
  markdown,
  title,
  base,
  onClose,
}: {
  markdown: string;
  title: string | null;
  base: DocumentBase | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ttlDays, setTtlDays] = useState<ShareTtlDays>(DEFAULT_SHARE_TTL_DAYS);
  const [phase, setPhase] = useState<Phase>({ step: "form", error: null });
  const [copied, setCopied] = useState(false);
  const ids = {
    heading: useId(),
    password: useId(),
    confirm: useId(),
    ttl: useId(),
    link: useId(),
  };
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (phase.step === "working") return;
    const error = checkShareInput(markdown, password, confirm);
    if (error) {
      setPhase({ step: "form", error });
      return;
    }
    setPhase({ step: "working" });
    try {
      const created = await createShareLink({ markdown, title, base, password, ttlDays });
      setPassword("");
      setConfirm("");
      setPhase({ step: "done", ...created });
    } catch (err) {
      setPhase({
        step: "form",
        error: err instanceof ShareError ? err.message : "Couldn't create the link. Try again.",
      });
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  const working = phase.step === "working";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click closes; Esc is handled above
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/40 px-4 py-16 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={ids.heading}
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl dark:border-stone-800 dark:bg-stone-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id={ids.heading}
              className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100"
            >
              <Lock size={18} className="text-accent-600 dark:text-accent-400" />
              Share with a password
            </h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Encrypted in your browser. The server never sees your document or your password.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <X size={16} />
          </button>
        </div>

        {phase.step === "done" ? (
          <div className="mt-5 flex flex-col gap-3">
            <div>
              <label htmlFor={ids.link} className={LABEL}>
                Your link
              </label>
              <div className="flex gap-2">
                <input
                  id={ids.link}
                  readOnly
                  value={phase.url}
                  onFocus={(event) => event.currentTarget.select()}
                  className={`${INPUT} font-mono text-xs`}
                />
                <button
                  type="button"
                  onClick={() => void copy(phase.url)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-accent-700"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Expires on{" "}
              <strong className="font-semibold text-stone-800 dark:text-stone-200">
                {new Date(phase.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
              </strong>
              . Send the password separately. It can't be recovered: without it, nobody can open
              this document, us included.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="mt-5 flex flex-col gap-4">
            <div>
              <label htmlFor={ids.password} className={LABEL}>
                Password
              </label>
              <input
                id={ids.password}
                type="password"
                autoComplete="new-password"
                // biome-ignore lint/a11y/noAutofocus: the dialog exists to take this input
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor={ids.confirm} className={LABEL}>
                Confirm password
              </label>
              <input
                id={ids.confirm}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor={ids.ttl} className={LABEL}>
                Expires after
              </label>
              <select
                id={ids.ttl}
                value={ttlDays}
                onChange={(event) => setTtlDays(Number(event.target.value) as ShareTtlDays)}
                className={INPUT}
              >
                {SHARE_TTL_DAYS.map((days) => (
                  <option key={days} value={days}>
                    {days === 1 ? "1 day" : `${days} days`}
                  </option>
                ))}
              </select>
            </div>
            {phase.step === "form" && phase.error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {phase.error}
              </p>
            )}
            <button
              type="submit"
              disabled={working}
              className="flex items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-700 disabled:opacity-60"
            >
              {working && <Loader2 size={14} className="animate-spin" />}
              {working ? "Encrypting…" : "Create link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
