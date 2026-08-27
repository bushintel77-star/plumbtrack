"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Check, AlertTriangle, Info, X } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

type ToastKind = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
  exiting: boolean;
}

interface ToastCtx {
  toast: (kind: ToastKind, message: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

// ── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((kind: ToastKind, message: string, action?: ToastAction) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, kind, message, action, exiting: false }]);
    // Action toasts (e.g. Undo) linger longer — a gloved thumb needs the
    // escape hatch for more than three seconds.
    const lifetime = action ? 6_000 : 3_000;
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 200);
    }, lifetime);
  }, []);

  return (
    <ToastContext.Provider value={{ toast: add }}>
      {children}
      {/* Toast container — fixed, centered top */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind} ${t.exiting ? "exiting" : ""}`}>
            {t.kind === "success" && <Check size={16} className="text-accent shrink-0" />}
            {t.kind === "error" && <AlertTriangle size={16} className="text-urgent shrink-0" />}
            {t.kind === "info" && <Info size={16} className="text-ink-low shrink-0" />}
            <span className="text-sm text-ink font-medium flex-1 leading-snug">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  setToasts((prev) => prev.filter((x) => x.id !== t.id));
                }}
                className="shrink-0 min-h-[36px] px-2.5 rounded-lg text-xs font-black uppercase tracking-wider text-accent bg-accent-dim border border-accent-line haptic"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="p-1 rounded hover:bg-fill-strong shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} className="text-ink-low" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}