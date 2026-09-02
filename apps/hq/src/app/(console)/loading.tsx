"use client"

import { useEffect, useState } from "react"

import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar"

/**
 * Console route loading boundary — replaces the blank white flash while the
 * HQ client bundle loads and hydrates (Next.js renders this inside a Suspense
 * boundary during navigation and first load). The gauge reads the Tier-1
 * chrome tokens so it matches the colourway instead of a default spinner.
 */
export default function Loading() {
  const [progress, setProgress] = useState(0)

  // Simulated progress toward the hydration settle point. Coarse so it never
  // implies exact completion; real readiness is the Suspense boundary itself.
  useEffect(() => {
    const timeline = window.setInterval(() => {
      setProgress(prev => (prev >= 88 ? prev : Math.min(prev + 4, 88)))
    }, 160)
    return () => window.clearInterval(timeline)
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-dvh flex-col items-center justify-center gap-5 bg-chrome-void"
    >
      <div className="flex flex-col items-center gap-3">
        <AnimatedCircularProgressBar
          max={100}
          min={0}
          value={progress}
          gaugePrimaryColor="var(--chrome-400)"
          gaugeSecondaryColor="var(--divider-etch)"
          className="size-28"
        />
        <p className="label-mono text-2xs text-ink-low">LOADING HQ CONSOLE</p>
      </div>
    </div>
  )
}
