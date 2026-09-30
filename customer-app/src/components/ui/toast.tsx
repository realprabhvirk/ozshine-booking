"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { errorMessage } from "@/lib/core/errors";

type ToastTone = "ok" | "bad" | "info" | "warn";
type ToastInput = { title: ReactNode; description?: ReactNode; tone?: ToastTone; durationMs?: number };
type ToastItem = ToastInput & { id: number };

type ToastApi = {
  toast: (t: ToastInput) => void;
  success: (title: ReactNode, description?: ReactNode) => void;
  // Shows the friendly message for any thrown error.
  error: (e: unknown, title?: ReactNode) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { ok: CheckCircle2, bad: XCircle, info: Info, warn: AlertTriangle };
const COLORS: Record<ToastTone, string> = {
  ok: "text-ok",
  bad: "text-bad",
  info: "text-info",
  warn: "text-warn",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setItems((all) => [...all.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.durationMs ?? (t.tone === "bad" ? 7000 : 4000));
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, tone: "ok" }),
      error: (e, title) => toast({ title: title ?? errorMessage(e), description: title ? errorMessage(e) : undefined, tone: "bad" }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6 print:hidden"
      >
        {items.map((t) => {
          const tone = t.tone ?? "info";
          const Icon = ICONS[tone];
          return (
            <div
              key={t.id}
              role={tone === "bad" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-sm animate-oz-toast items-start gap-3 rounded-xl bg-panel p-4 text-fg shadow-pop ring-1 ring-line"
            >
              <Icon size={20} className={cn("mt-0.5 shrink-0", COLORS[tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-fg-muted">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="-m-1 rounded-md p-1 text-fg-faint hover:text-fg"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
