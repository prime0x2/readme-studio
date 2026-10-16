import { AlertCircle, BookOpenText, Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import { type FormEvent, type ReactNode, type RefObject, useId, useState } from "react";

/** A scalloped seal edge: a circle with small bumps, in a 64-unit box. */
const SEAL_PATH = (() => {
  const points: string[] = [];
  const steps = 144;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const radius = 30 + 1.6 * Math.cos(angle * 18);
    points.push(
      `${(32 + radius * Math.cos(angle)).toFixed(2)},${(32 + radius * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return `M${points.join("L")}Z`;
})();

function Seal({ muted }: { muted?: boolean }) {
  const gradient = useId();
  return (
    <span className="relative flex size-16 items-center justify-center drop-shadow-[0_6px_10px_rgba(122,48,19,0.25)]">
      <svg viewBox="0 0 64 64" className="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={muted ? "#a8a29e" : "#f68d44"} />
            <stop offset="1" stopColor={muted ? "#78716c" : "#bf440e"} />
          </linearGradient>
        </defs>
        <path d={SEAL_PATH} fill={`url(#${gradient})`} />
        <circle cx="32" cy="32" r="22.5" fill="none" stroke="white" strokeOpacity="0.35" />
      </svg>
      {muted ? (
        <AlertCircle size={22} className="relative text-white" aria-hidden="true" />
      ) : (
        <Lock size={22} className="relative text-white" aria-hidden="true" />
      )}
    </span>
  );
}

/** The shape of a README with its text blacked out: what's behind the seal. */
function RedactedLines({ sweeping }: { sweeping: boolean }) {
  const bar = "rounded-sm bg-stone-200 dark:bg-stone-800";
  return (
    <div aria-hidden="true" className="relative overflow-hidden">
      <div className="flex flex-col gap-2.5">
        <div className={`${bar} h-5 w-2/5 bg-stone-300 dark:bg-stone-700`} />
        <div className={`${bar} mt-1 h-2.5 w-full`} />
        <div className={`${bar} h-2.5 w-[93%]`} />
        <div className={`${bar} h-2.5 w-[61%]`} />
        <div className={`${bar} mt-3 h-3.5 w-1/4 bg-stone-300 dark:bg-stone-700`} />
        <div className={`${bar} mt-1 h-2.5 w-[88%]`} />
      </div>
      {sweeping && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/70 to-transparent motion-safe:animate-sweep dark:via-white/10" />
      )}
    </div>
  );
}

/** The page around the sealed sheet: wordmark above, a note below. */
function Frame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center bg-paper px-4 py-8 text-stone-900 sm:py-14 dark:bg-stone-950 dark:text-stone-100">
      <a
        href="/"
        className="flex items-center gap-2 rounded-lg font-display text-base font-semibold tracking-tight text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-500 dark:text-stone-300"
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 text-white">
          <BookOpenText size={15} aria-hidden="true" />
        </span>
        <span>
          Readme<em className="text-accent-600 dark:text-accent-400">Studio</em>
        </span>
      </a>

      <div className="relative mt-8 w-full max-w-md sm:mt-12">
        {/* a second sheet under the first: it's a document, not a dialog */}
        <div
          aria-hidden="true"
          className="absolute inset-0 translate-y-2 rotate-[1.4deg] rounded-xl border border-stone-200 bg-white/70 dark:border-stone-800 dark:bg-stone-900/60"
        />
        <section className="relative rounded-xl border border-stone-200 bg-white px-6 pt-7 pb-8 shadow-[0_18px_40px_-24px_rgba(68,45,20,0.35)] sm:px-9 sm:pt-9 dark:border-stone-800 dark:bg-stone-900 dark:shadow-none">
          {children}
        </section>
      </div>

      {footer && (
        <div className="mt-8 max-w-md text-center text-sm text-stone-500 dark:text-stone-400">
          {footer}
        </div>
      )}
    </main>
  );
}

/** Redacted lines, then a dashed fold with the seal on it. */
function SealedTop({ sweeping, muted }: { sweeping: boolean; muted?: boolean }) {
  return (
    <>
      <div className={muted ? "opacity-60" : undefined}>
        <RedactedLines sweeping={sweeping} />
      </div>
      <div className="relative my-6 flex justify-center">
        <div
          aria-hidden="true"
          className="absolute inset-x-[-1.5rem] top-1/2 border-t border-dashed border-stone-300 sm:inset-x-[-2.25rem] dark:border-stone-700"
        />
        <Seal muted={muted} />
      </div>
    </>
  );
}

const writeYourOwn = (
  <a
    href="/"
    className="font-medium text-accent-700 underline-offset-4 hover:underline dark:text-accent-400"
  >
    Write your own README with ReadmeStudio
  </a>
);

export function LoadingSheet() {
  return (
    <Frame>
      <SealedTop sweeping />
      <p
        role="status"
        className="flex items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-400"
      >
        <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Opening link…
      </p>
    </Frame>
  );
}

export function UnavailableSheet({ message }: { message: string }) {
  const expired = /expired/i.test(message);
  return (
    <Frame footer={writeYourOwn}>
      <SealedTop sweeping={false} muted />
      <div role="alert" className="text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{message}</h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          {expired
            ? "Shared links stop working after their expiry date. Ask the sender for a new link."
            : "Check that you copied the whole link, or ask the sender for a new one."}
        </p>
      </div>
    </Frame>
  );
}

export function LockedSheet({
  expiresAt,
  password,
  onPasswordChange,
  onSubmit,
  working,
  error,
  attempt,
  inputRef,
}: {
  expiresAt: number;
  password: string;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  working: boolean;
  error: string | null;
  /** Changes on every failed attempt, to replay the shake. */
  attempt: number;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [visible, setVisible] = useState(false);
  const ids = { input: useId(), error: useId() };
  const expiry = new Date(expiresAt).toLocaleDateString(undefined, { dateStyle: "long" });

  return (
    <Frame
      footer={
        <>
          <p>This link works until {expiry}.</p>
          <p className="mt-3">{writeYourOwn}</p>
        </>
      }
    >
      <SealedTop sweeping={working} />
      <form onSubmit={onSubmit}>
        <h1 className="text-center font-display text-2xl font-semibold tracking-tight">
          This document is sealed
        </h1>
        <p className="mt-1.5 text-center text-sm text-stone-600 dark:text-stone-400">
          Enter the password you were given to open it.
        </p>

        <label
          htmlFor={ids.input}
          className="mt-6 block text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          Password
        </label>
        <div
          key={attempt}
          className={`relative mt-1.5 ${attempt > 0 ? "motion-safe:animate-shake" : ""}`}
        >
          <input
            id={ids.input}
            ref={inputRef}
            type={visible ? "text" : "password"}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            // biome-ignore lint/a11y/noAutofocus: the page exists to take this input
            autoFocus
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ids.error : undefined}
            className={`w-full rounded-lg border bg-white py-2.5 pr-11 pl-3 text-base text-stone-900 focus:ring-2 focus:outline-none sm:text-sm dark:bg-stone-950 dark:text-stone-100 ${
              error
                ? "border-red-400 focus:border-red-400 focus:ring-red-200 dark:border-red-500/70 dark:focus:ring-red-900"
                : "border-stone-300 focus:border-accent-400 focus:ring-accent-200 dark:border-stone-700 dark:focus:ring-accent-900"
            }`}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-stone-400 hover:text-stone-700 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent-500 dark:hover:text-stone-200"
          >
            {visible ? (
              <EyeOff size={17} aria-hidden="true" />
            ) : (
              <Eye size={17} aria-hidden="true" />
            )}
          </button>
        </div>
        {error && (
          <p id={ids.error} role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={working || !password}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:opacity-50"
        >
          {working ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
          {working ? "Unlocking…" : "Unlock"}
        </button>

        <p className="mt-5 flex items-start justify-center gap-2 text-xs text-stone-500 dark:text-stone-400">
          <ShieldCheck
            size={14}
            className="mt-px shrink-0 text-accent-600 dark:text-accent-400"
            aria-hidden="true"
          />
          The document is decrypted on this device. Your password is never sent anywhere.
        </p>
      </form>
    </Frame>
  );
}
