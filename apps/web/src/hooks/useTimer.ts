import { useEffect, useRef, useState } from "react";

/**
 * Live elapsed seconds since `startedAt` (ms epoch).
 *
 * - Uses absolute UTC timestamps so the timer survives tab backgrounding.
 * - A `requestAnimationFrame` loop detects the exact frame where a second
 *   boundary is crossed, so the first visible update is frame-accurate.
 * - State is only updated once per second (when the floor actually changes),
 *   so there are no wasted re-renders.
 */
export function useTimer(running: boolean, startedAt: number | null): number {
  const [, setTick] = useState(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!running || !startedAt) return;

    let rafId: number;
    let intervalId: ReturnType<typeof setInterval>;

    const update = () => {
      const next = Math.floor((Date.now() - startedAt) / 1000);
      if (next !== elapsedRef.current) {
        elapsedRef.current = next;
        setTick((n) => n + 1);
      }
    };

    // Frame-accurate second-boundary detection.
    const frame = () => {
      update();
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    // Fallback for backgrounded tabs (rAF throttled to ~1 Hz).
    intervalId = setInterval(update, 1000);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(intervalId);
    };
  }, [running, startedAt]);

  if (!running || !startedAt) return 0;
  return elapsedRef.current;
}
