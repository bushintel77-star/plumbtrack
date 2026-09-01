import { Suspense } from "react"

import { AppShell } from "@/features/shell/AppShell"

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-chrome-void text-sm text-ink-low">
          Loading HQ console…
        </div>
      }
    >
      <AppShell />
    </Suspense>
  )
}
