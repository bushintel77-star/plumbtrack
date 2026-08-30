"use client"

import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"

import { fetchBoardPayload } from "@/lib/adapter"
import { FORCE_DEMO } from "@/lib/api"
import { cacheJobs } from "@/lib/offline"
import { useBoardStore } from "@/stores/boardStore"

/**
 * Store lifecycle for any workspace that reads the board: live API hydration
 * with the seeded demo fallback, the offline cache write, and the one-second
 * heartbeat that drives running timers. Mount it once per visible workspace —
 * both the legacy Board and the FieldLoop shell depend on it.
 */
export function useBoardLifecycle(): void {
  const dataMode = useBoardStore(s => s.dataMode)
  const hydrateFromApi = useBoardStore(s => s.hydrateFromApi)
  const enterDemo = useBoardStore(s => s.enterDemo)

  const boardQuery = useQuery({
    queryKey: ["board"],
    queryFn: fetchBoardPayload,
    refetchInterval: 5_000,
    enabled: !FORCE_DEMO && dataMode !== "demo"
  })

  useEffect(() => {
    if (FORCE_DEMO) {
      enterDemo()
      void cacheJobs(Object.values(useBoardStore.getState().jobs))
      return
    }
    if (boardQuery.data && boardQuery.data.jobs.length > 0) {
      hydrateFromApi(boardQuery.data)
      void cacheJobs(Object.values(useBoardStore.getState().jobs))
    } else if (boardQuery.isError && dataMode === "connecting") {
      enterDemo()
    }
  }, [boardQuery.data, boardQuery.isError, dataMode, hydrateFromApi, enterDemo])

  useEffect(() => {
    const interval = setInterval(() => useBoardStore.getState().tick(), 1000)
    return () => clearInterval(interval)
  }, [])
}
