"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Check, AlertTriangle, Info, X } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  exiting: boolean;
}

interface ToastCtx {
  toast: (kind: ToastKind, message: string) => void;
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

  const add = useCallback((kind: ToastKind, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, kind, message, exiting: false }]);
    // Auto-dismiss after 3s
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 200);
    }, 3000);
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
            <span className="text-[13px] text-ink font-medium flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="p-1 rounded hover:bg-fill-strong shrink-0"
              aria-label="Dismiss"
            >
              <X size={13} className="text-ink-low" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}