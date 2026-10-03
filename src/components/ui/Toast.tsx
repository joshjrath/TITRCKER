"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "./cn";

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Optional action, e.g. { label: "Undo", onAction: restore }. */
  action?: { label: string; onAction: () => void };
  /** Auto-dismiss after ms. Defaults: 5000 (success/info), 8000 with an action; errors persist until dismissed. */
  durationMs?: number | null;
}

interface ToastRecord extends Required<Pick<ToastOptions, "title" | "variant">> {
  id: number;
  description?: string;
  action?: ToastOptions["action"];
  durationMs: number | null;
}

export type Politeness = "polite" | "assertive";

interface ToastApi {
  /** Show a visible toast and announce it. Returns its id. */
  toast: (opts: ToastOptions) => number;
  dismiss: (id: number) => void;
  /** Screen-reader-only announcement (e.g. "Saved"), no visible toast. */
  announce: (message: string, politeness?: Politeness) => void;
}

const noop: ToastApi = {
  toast: () => {
    if (process.env.NODE_ENV !== "production") console.warn("useToast() used outside <ToastProvider>");
    return -1;
  },
  dismiss: () => {},
  announce: () => {},
};

const ToastContext = createContext<ToastApi>(noop);

/** Access toasts and announcements. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

/**
 * Hosts the two live regions (polite + assertive) and the visible toast stack. Mount once near the root.
 * The visible stack is not itself a live region, so each message is announced exactly once.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const nextId = useRef(1);
  const announceTimers = useRef<Record<Politeness, ReturnType<typeof setTimeout> | undefined>>({ polite: undefined, assertive: undefined });

  const announce = useCallback((message: string, politeness: Politeness = "polite") => {
    const set = politeness === "assertive" ? setAssertive : setPolite;
    // Clear then set so the same message twice is announced twice.
    set("");
    clearTimeout(announceTimers.current[politeness]);
    announceTimers.current[politeness] = setTimeout(() => set(message), 60);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++;
      const variant = opts.variant ?? "success";
      const durationMs =
        opts.durationMs !== undefined ? opts.durationMs : variant === "error" ? null : opts.action ? 8000 : 5000;
      setToasts((ts) => [...ts.slice(-3), { id, title: opts.title, description: opts.description, variant, action: opts.action, durationMs }]);
      const spoken = opts.description ? `${opts.title}. ${opts.description}` : opts.title;
      announce(spoken, variant === "error" ? "assertive" : "polite");
      return id;
    },
    [announce],
  );

  const api = useMemo(() => ({ toast, dismiss, announce }), [toast, dismiss, announce]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
      <section
        aria-label="Notifications"
        className={cn(
          "pointer-events-none fixed inset-x-4 z-[60] flex flex-col items-stretch gap-2",
          "bottom-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom,0px)+12px)] md:bottom-6 md:left-auto md:right-6 md:w-[380px]",
          toasts.length === 0 && "hidden",
        )}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} dismiss={dismiss} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

const variantStyle: Record<ToastVariant, { Icon: typeof Info; icon: string; label: string }> = {
  success: { Icon: CircleCheck, icon: "text-positive", label: "Success" },
  error: { Icon: CircleAlert, icon: "text-danger", label: "Error" },
  info: { Icon: Info, icon: "text-accent", label: "Note" },
};

function ToastItem({ toast, dismiss }: { toast: ToastRecord; dismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.durationMs);
  const startedAt = useRef(0);

  useEffect(() => {
    if (remaining.current === null || paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => dismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      if (remaining.current !== null) remaining.current = Math.max(800, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, dismiss, toast.id]);

  const onDismiss = () => dismiss(toast.id);

  const v = variantStyle[toast.variant];
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex animate-toast-in items-start gap-3 rounded-control border bg-surface-raised py-3 pl-4 pr-2 shadow-menu",
        toast.variant === "error" ? "border-danger/40" : "border-line-strong",
      )}
    >
      <v.Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", v.icon)} />
      <div className="min-w-0 flex-1 py-px">
        <p className="text-[0.875rem] font-medium leading-5 text-text">
          <span className="sr-only">{v.label}: </span>
          {toast.title}
        </p>
        {toast.description ? <p className="mt-0.5 text-label text-text-2">{toast.description}</p> : null}
      </div>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onAction();
            onDismiss();
          }}
          className="-my-1 h-11 shrink-0 rounded-[8px] px-3 text-[0.875rem] font-medium text-accent hover:bg-accent-wash md:h-8"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="-my-1 inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-text-2 hover:bg-surface-hover hover:text-text md:size-8"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
