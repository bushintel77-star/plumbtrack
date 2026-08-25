"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

const MUTED = "var(--sheet-muted)";
const BORDER = "var(--app-border)";
const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex=\"-1\"])";

/** Slide-up bottom sheet with spring animation, Escape dismissal, focus trap, and backdrop blur. */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  label: string;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const close = useCallback(() => {
    onCloseRef.current();
    window.requestAnimationFrame(() => {
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const firstFocusable = sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (firstFocusable ?? sheetRef.current)?.focus();
    }, 0);

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;

      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        sheetRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handler);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = previousOverflow;
    };
  }, [close, open]);

  return (
    <>
      <div
        className={`fixed inset-0 z-30 backdrop-blur-sm transition-all duration-250 ${
          open ? "bg-black/55 opacity-100" : "bg-transparent opacity-0 pointer-events-none"
        }`}
        onClick={close}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        tabIndex={-1}
        className={`fixed bottom-0 left-1/2 z-40 w-full max-w-md lg:max-w-xl -translate-x-1/2 rounded-t-3xl border-t outline-none ${
          open ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
        }`}
        style={{
          background: "var(--sheet-bg)",
          borderColor: BORDER,
          boxShadow: "0 -10px 40px var(--app-shadow)",
          transition: "transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 200ms ease",
        }}
        role="dialog"
        aria-modal={open}
        aria-label={label}
        aria-labelledby={titleId}
        aria-hidden={!open}
      >
        <div className="pt-3 pb-1 flex justify-center" aria-hidden="true">
          <div className="w-10 h-1.5 rounded-full" style={{ backgroundColor: "var(--app-border)" }} />
        </div>

        <div className="px-5 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[82vh] overflow-y-auto">
          <p id={titleId} className="text-[17px] font-extrabold tracking-tight" style={{ color: "var(--app-text)" }}>
            {title}
          </p>
          {subtitle && (
            <p className="text-[13px] mt-0.5 mb-5" style={{ color: MUTED }}>
              {subtitle}
            </p>
          )}
          <div className="animate-fade-in">{children}</div>
        </div>
      </div>
    </>
  );
}

/** Card tile inside sheets — Lucide icon + title + hint, 2-up grid, haptic press. */
export function SheetActionCard({
  icon: Icon,
  title,
  hint,
  onClick,
  disabled = false,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group text-left rounded-2xl p-3.5 transition-all duration-150 haptic disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
      style={{
        background: "linear-gradient(180deg, var(--sheet-tile) 0%, var(--sheet-tile-soft) 100%)",
        border: `1px solid ${BORDER}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 14px var(--app-shadow)",
      }}
    >
      <span
        className="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-2.5"
        style={{ backgroundColor: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, color: "var(--accent)" }}
      >
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="block text-[14px] font-bold tracking-tight leading-tight" style={{ color: "var(--app-text)" }}>
        {title}
      </span>
      <span className="block text-[11.5px] mt-0.5 leading-snug" style={{ color: MUTED }}>
        {hint}
      </span>
    </button>
  );
}
