"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

interface SwipeAction {
  label: string;
  icon: string;
  color: string;
  onTrigger: () => void;
}

interface SwipeableCardProps {
  children: ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  className?: string;
}

/** Horizontal gesture card — drag left or right to reveal an action.
 *  Actions only render visible when dragged past 10px threshold. */
export function SwipeableCard({
  children,
  leftAction,
  rightAction,
  className = "",
}: SwipeableCardProps) {
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const startX = useRef(0);
  const currentOffset = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    setAnimating(false);
    startX.current = e.clientX;
    currentOffset.current = 0;
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (startX.current === 0) return;
      const dx = e.clientX - startX.current;
      const maxDrag = 120;
      currentOffset.current = Math.max(-maxDrag, Math.min(maxDrag, dx));
      setOffset(currentOffset.current);
    },
    [],
  );

  const onPointerUp = useCallback(() => {
    setAnimating(true);
    const threshold = 60;

    if (currentOffset.current > threshold && rightAction) {
      setOffset(0);
      rightAction.onTrigger();
    } else if (currentOffset.current < -threshold && leftAction) {
      setOffset(0);
      leftAction.onTrigger();
    } else {
      setOffset(0);
    }

    startX.current = 0;
    setTimeout(() => setAnimating(false), 300);
  }, [leftAction, rightAction]);

  const showRight = offset > 10 && rightAction;
  const showLeft = offset < -10 && leftAction;

  return (
    <div className="relative overflow-hidden rounded-[20px]">
      {/* Right action background */}
      {rightAction && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-end pr-5 rounded-[20px]"
          style={{
            backgroundColor: rightAction.color,
            opacity: showRight ? 1 : 0,
            transition: "opacity 150ms ease",
            pointerEvents: showRight ? "auto" : "none",
          }}
          aria-hidden={!showRight}
        >
          <span className="text-white text-sm font-bold flex items-center gap-1.5 select-none">
            {rightAction.icon} {rightAction.label}
          </span>
        </div>
      )}

      {/* Left action background */}
      {leftAction && (
        <div
          className="absolute inset-y-0 left-0 flex items-center pl-5 rounded-[20px]"
          style={{
            backgroundColor: leftAction.color,
            opacity: showLeft ? 1 : 0,
            transition: "opacity 150ms ease",
            pointerEvents: showLeft ? "auto" : "none",
          }}
          aria-hidden={!showLeft}
        >
          <span className="text-white text-sm font-bold flex items-center gap-1.5 select-none">
            {leftAction.icon} {leftAction.label}
          </span>
        </div>
      )}

      {/* Card */}
      <div
        className={`${className} select-none touch-pan-y cursor-pointer`}
        style={{
          transform: `translateX(${offset}px)`,
          transition: animating ? "transform 250ms cubic-bezier(0.22, 0.61, 0.36, 1)" : "none",
          touchAction: "pan-y",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" && rightAction) rightAction.onTrigger();
          if (e.key === "ArrowLeft" && leftAction) leftAction.onTrigger();
        }}
      >
        {children}
      </div>
    </div>
  );
}