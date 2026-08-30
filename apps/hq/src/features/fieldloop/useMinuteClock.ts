"use client"

import { useEffect, useState } from "react"

/**
 * One minute-resolution clock for a whole surface. Everything that ages with
 * wall time — the now-line and the Needs Attention list — reads the same
 * instant from a single interval rather than one timer per row.
 */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}
