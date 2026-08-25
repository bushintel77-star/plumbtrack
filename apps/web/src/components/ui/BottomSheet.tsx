"use client";

import { useEffect, useRef, type ReactNode } from "react";

const MUTED = "var(--sheet-muted)";
const BORDER = "var(--app-border)";

/** Slide-up bottom sheet with spring animation, Escape dismissal, backdrop blur. */
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

  const close = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    onClose();
  };

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    setTimeout(() => sheetRef.current?.focus(), 80);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      {/* Backdrop with blur */}
      <div
        className={`fixed inset-0 z-30 backdrop-blur-sm transition-all duration-250 ${
          open ? "bg-black/55 opacity-100" : "bg-transparent opacity-0 pointer-events-none"
        }`}
        onClick={close}
        aria-hidden
      />

      {/* Sheet — cubic-bezier spring */}
      <div
        ref={sheetRef}
        tabIndex={open ? 0 : -1}
        className={`fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t outline-none ${
          open
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 pointer-events-none"
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
        aria-hidden={!open}
      >
        {/* Grab handle */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full" style={{ backgroundColor: "var(--app-border)" }} />
        </div>

        <div className="px-5 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[70vh] overflow-y-auto">
          <p className="text-white text-[17px] font-extrabold tracking-tight">{title}</p>
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

/** Card tile inside sheets — emoji + title + hint, 2-up grid, haptic press. */
export function SheetActionCard({
  emoji,
  title,
  hint,
  onClick,
  disabled = false,
}: {
  emoji: string;
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
        className="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-2.5 text-[17px]"
        style={{ backgroundColor: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}` }}
      >
        {emoji}
      </span>
      <span className="block text-white text-[14px] font-bold tracking-tight leading-tight">
        {title}
      </span>
      <span className="block text-[11.5px] mt-0.5 leading-snug" style={{ color: MUTED }}>
        {hint}
      </span>
    </button>
  );
}