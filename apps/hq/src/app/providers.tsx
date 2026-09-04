"use client"

import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useSlackBridge } from "@/lib/slackBridge"
import { registerSyncDrain, type SyncOp } from "@/lib/offline"
import { authApi, persistJobStatus } from "@/lib/api"
import { toast } from "@/hooks/use-toast"

function useBootstrapServices() {
  // FSM → Slack state-machine bridge (transition cards + job channels).
  useSlackBridge()
}

/** Replay a queued op against the endpoint matching its kind — assign ops
 *  carry {techId, startBlock} and must hit the assignment endpoint, not the
 *  status PATCH (which would otherwise send an empty body and lose the
 *  assignment silently). */
function persistSyncOp(op: SyncOp): Promise<void> {
  if (op.op === "assign") {
    const payload = op.payload as { techId: string; startBlock: number }
    return authApi.assignment(op.jobId, payload.techId, payload.startBlock).then(() => undefined)
  }
  const payload = op.payload as { status: "scheduled" | "in_progress" | "completed" }
  return persistJobStatus(op.jobId, payload.status)
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
      persistSyncOp,
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
