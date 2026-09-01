"use client"

import { useEffect, useState } from "react"

/**
 * Ticking job timer — the dispatch board's signature artifact. It starts at a
 * fixed offset and counts up, so the hero carries the same live readout as the
 * console. Respects reduced motion by only updating once (no per-second tick).
 */
export function LiveTimer({ startSeconds = 2538 }: { startSeconds?: number }) {
  const [seconds, setSeconds] = useState(startSeconds)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => setSeconds(value => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  return (
    <span className="tnum font-mono text-xl font-semibold tracking-tight" aria-live="off">
      {[hours, minutes, secs].map(n => String(n).padStart(2, "0")).join(":")}
    </span>
  )
}
