"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

const MUTED = "var(--sheet-muted)";
const BORDER = "var(--app-border)";
const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex=\"-1\"])";

// Drag-to-dismiss tuning (px / px-per-ms).
const DRAG_CLOSE_DIST = 112; // drag past this → close
const DRAG_CLOSE_VELOCITY = 0.5; // fling faster than this (after 48px) → close
const DRAG_RESIST_AFTER = 140; // resistance kicks in past this distance
const DRAG_RESIST_FACTOR = 0.35; // each extra px moves the sheet this fraction
const DRAG_CLAIM_DIST = 8; // upward intent past this releases the claim

const SHEET_TRANSITION =
  "transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 200ms ease";

interface DragState {
  pointerId: number;
  startY: number;
  dy: number;
  lastY: number;
  lastT: number;
  claimed: boolean;
  claimEl: HTMLElement | null;
}

/** Slide-up bottom sheet with spring animation, drag-down-to-dismiss, Escape
 *  dismissal, focus trap, and backdrop blur. */
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const dragRef = useRef<DragState | null>(null);
  const titleId = useId();
  // When dragging, the inline transform is mutated directly (no per-move
  // re-renders); this flag only toggles the spring transition on/off.
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // When the sheet closes (Escape, backdrop, or an external onClose — e.g. a
  // result row navigating away), release focus from inside the panel before
  // aria-hidden hides it from assistive technology. Without this, browsers
  // warn about a focused element inside an aria-hidden subtree.
  useEffect(() => {
    if (open) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && sheetRef.current?.contains(active)) active.blur();
  }, [open]);

  const close = useCallback(() => {
    onCloseRef.current();
    window.requestAnimationFrame(() => {
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

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

  /* ── Drag-to-dismiss ──────────────────────────────────────────────────── */

  const endDrag = useCallback(
    (closeNow: boolean) => {
      const st = dragRef.current;
      if (st?.claimEl) st.claimEl.style.touchAction = "";
      const root = sheetRef.current;
      if (root) {
        root.style.transform = "";
        root.style.opacity = "";
        root.style.transition = SHEET_TRANSITION;
        try {
          if (st) root.releasePointerCapture(st.pointerId);
        } catch {
          // No active pointer — synthetic events or capture already released.
        }
      }
      dragRef.current = null;
      setDragging(false);

      if (closeNow && root) {
        // Animate the sheet fully off-screen, then close (matches the closed
        // class transform so there's no visual jump when `open` flips).
        root.style.transition = SHEET_TRANSITION;
        root.style.transform = "translate(-50%, 110%)";
        root.style.opacity = "0";
        window.setTimeout(close, 260);
      }
    },
    [close],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!open || event.button !== 0 || dragRef.current) return;
    const scrollEl = scrollRef.current;
    const onHandle = !scrollEl || !scrollEl.contains(event.target as Node);
    const atTop = !scrollEl || scrollEl.scrollTop <= 0;
    // Let inner content scroll normally once it's scrolled down; only the
    // handle/header and the top of the content start a drag.
    if (!onHandle && !atTop) return;

    // Claim the touch gesture so the browser doesn't pan it (pointer moves
    // keep flowing and we decide on the first move whether to drag or let go).
    const claimEl = (event.target as HTMLElement) || null;
    if (claimEl) claimEl.style.touchAction = "none";
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      dy: 0,
      lastY: event.clientY,
      lastT: performance.now(),
      claimed: false,
      claimEl,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    if (!st || st.pointerId !== event.pointerId) return;

    const dy = event.clientY - st.startY;
    // Started at the top but clearly swiping up — release the claim so the
    // content can scroll on the next gesture.
    if (dy < -DRAG_CLAIM_DIST) {
      endDrag(false);
      return;
    }
    if (dy <= 0) return;

    st.dy = dy;
    st.lastY = event.clientY;
    st.lastT = performance.now();

    const root = sheetRef.current;
    if (!root) return;

    if (!st.claimed) {
      st.claimed = true;
      setDragging(true);
      try {
        root.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic events carry no active pointer — the transform still works.
      }
    }

    // Elastic resistance past the threshold keeps it feeling physical.
    const resisted =
      dy > DRAG_RESIST_AFTER ? DRAG_RESIST_AFTER + (dy - DRAG_RESIST_AFTER) * DRAG_RESIST_FACTOR : dy;
    root.style.transform = `translate(-50%, ${resisted.toFixed(1)}px)`;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    if (!st || st.pointerId !== event.pointerId) return;
    const dt = performance.now() - st.lastT;
    const velocity = dt > 0 ? Math.abs(event.clientY - st.lastY) / dt : 0;
    const shouldClose =
      st.dy > DRAG_CLOSE_DIST || (st.dy > 48 && velocity > DRAG_CLOSE_VELOCITY);
    endDrag(shouldClose);
  };

  const onPointerCancel = () => {
    if (dragRef.current) endDrag(false);
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-30 backdrop-blur-sm transition-all duration-250 ${
          open ? "bg-scrim opacity-100" : "bg-transparent opacity-0 pointer-events-none"
        }`}
        onClick={close}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className={`fixed bottom-0 left-1/2 z-40 w-full max-w-md lg:max-w-xl -translate-x-1/2 rounded-t-3xl border-t outline-none ${
          open ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
        } ${dragging ? "select-none" : ""}`}
        style={{
          background: "var(--sheet-bg)",
          borderColor: BORDER,
          boxShadow: "0 -10px 40px var(--app-shadow)",
          transition: dragging ? "none" : SHEET_TRANSITION,
        }}
        role="dialog"
        aria-modal={open}
        aria-label={label}
        aria-labelledby={titleId}
        aria-hidden={!open}
      >
        {/* Grab handle — touch-none so handle drags never turn into scrolls. */}
        <div
          className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none"
          aria-hidden="true"
        >
          <div className="w-10 h-1.5 rounded-full" style={{ backgroundColor: "var(--app-border)" }} />
        </div>

        <div
          ref={scrollRef}
          className="px-5 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[82vh] overflow-y-auto"
        >
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

/** Card tile inside sheets — icon + title + hint, 2-up grid, haptic press.
 *  Accepts both Lucide icons and the bespoke FieldIcons set. */
export function SheetActionCard({
  icon: Icon,
  title,
  hint,
  onClick,
  disabled = false,
  active = false,
  className = "",
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`sheet-action-card group text-left rounded-2xl p-3.5 transition-all duration-150 haptic disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100 ${className} ${active ? "is-active" : ""}`}
      style={{
        background: "linear-gradient(180deg, var(--sheet-tile) 0%, var(--sheet-tile-soft) 100%)",
        border: `1px solid ${BORDER}`,
        boxShadow: "var(--shadow-sheet), 0 4px 14px var(--app-shadow)",
      }}
    >
      <span
        className="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-2.5"
        style={{ backgroundColor: "var(--accent-dim)", border: `1px solid ${BORDER}`, color: "var(--accent)" }}
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
