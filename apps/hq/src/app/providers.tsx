"use client"

import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useTelemetrySocket } from "@/lib/telemetry"
import { useSlackBridge } from "@/lib/slackBridge"
import { registerSyncDrain } from "@/lib/offline"
import { persistJobStatus } from "@/lib/api"
import { toast } from "@/hooks/use-toast"

function useBootstrapServices() {
  // Real-time telemetry (WebSocket channels + throttled fleet pings).
  useTelemetrySocket()
  // FSM → Slack state-machine bridge (transition cards + job channels).
  useSlackBridge()
}

function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return
    // Production-only registration — dev caching breaks HMR (field agent
    // convention). Also requests a Background Sync tag when supported.
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return

    const register = (): void => {
      void navigator.serviceWorker
        .register("/sw.js")
        .then(registration => {
          const syncManager = (
            registration as ServiceWorkerRegistration & {
              sync?: { register: (tag: string) => Promise<void> }
            }
          ).sync
          return syncManager?.register("plumbtrack-hq-sync").catch(() => undefined)
        })
        .catch(() => undefined)
    }
    register()

    const unregister = registerSyncDrain(
      (jobId, payload) =>
        persistJobStatus(jobId, (payload as { status: "scheduled" | "in_progress" | "completed" }).status),
      count =>
        toast({
          title: "Offline changes synced",
          description: `${count} queued mutation${count > 1 ? "s" : ""} drained to the API.`
        })
    )
    return unregister
  }, [])
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The board must stay usable when the API is down — never retry
            // into oblivion; the hydration hook flips to demo data on failure.
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 4_000
          }
        }
      })
  )

  useBootstrapServices()
  useServiceWorker()

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </QueryClientProvider>
  )
}
