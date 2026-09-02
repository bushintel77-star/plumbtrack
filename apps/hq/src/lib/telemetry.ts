"use client"

import { useEffect } from "react"

import { authApi, API_URL } from "@/lib/api"
import { useBoardStore } from "@/stores/boardStore"
import type { JobStatus } from "@/types"

/** The org-scoped frames the API live bus emits (mirrors apps/api liveBus). */
type LiveFrame =
  | { topic: "topic/stream/hello"; orgId: string }
  | { topic: "topic/stream/ping" }
  | { topic: "topic/stream/error"; reason: string }
  | { topic: "topic/jobs/status"; orgId: string; jobId: string; status: string }
  | { topic: "topic/jobs/updated"; orgId: string; jobId: string; patch: Record<string, unknown> }
  | { topic: "topic/jobs/activity"; orgId: string; jobId: string; activity: "clock-in" | "clock-out"; entryId: string }
  | {
      topic: "topic/fleet/telemetry"
      orgId: string
      vehicleId: string
      techId: string | null
      lat: number
      lng: number
      heading: number | null
      speed: number | null
      presence: "on_job" | "on_break"
      timestamp: string
    }

/**
 * Live board socket for the dispatch console. Connects to `/api/stream` (the
 * org-scoped WebSocket) and applies frames straight to the board store:
 * job status/activity frames re-color blocks, and `topic/fleet/telemetry`
 * feeds the live-location dictionary that drives the vehicle symbols.
 *
 * Reconnect discipline mirrors the field app: exponential backoff (1s → 30s)
 * with jitter, and on reconnect the board reconciles with a fresh pull so
 * missed frames never leave stale state. A missing stream token just leaves
 * the socket retrying — the board keeps working on polling.
 */

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

function reconnectDelay(attempt: number): number {
  const exponential = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt)
  return exponential + Math.random() * 500
}

function wsUrl(host: string, token: string): string {
  const base = host.replace(/\/+$/, "").replace(/^http/, "ws")
  return `${base}/api/stream?token=${encodeURIComponent(token)}`
}

/** The API's job status vocabulary maps onto the HQ board's. Unknown values
 *  are dropped — a malformed frame must never corrupt board state. */
function mapJobStatus(status: string): JobStatus | null {
  switch (status) {
    case "scheduled":
      return "scheduled"
    case "in_progress":
      return "active"
    case "completed":
      return "complete"
    default:
      return null
  }
}

/** Apply a live frame to the board store. */
function applyFrame(frame: LiveFrame): void {
  const store = useBoardStore.getState()
  switch (frame.topic) {
    case "topic/jobs/status": {
      const status = mapJobStatus(frame.status)
      if (frame.jobId && status) store.applyRemoteStatus(frame.jobId, status)
      return
    }
    case "topic/jobs/updated":
      // Server-authoritative assignment/time is surfaced by the board's own
      // 5s refetch; a full patch here would clobber optimistic drag state.
      return
    case "topic/jobs/activity":
      // Clock activity re-colors via the status/refetch path; nothing to do.
      return
    case "topic/fleet/telemetry":
      store.mergeLiveLocations([
        {
          vehicleId: frame.vehicleId,
          lat: frame.lat,
          lng: frame.lng,
          // Store contract uses non-nullable numbers: no bearing means the
          // marker stays north; no speed means stationary.
          heading: frame.heading ?? -90,
          speed: frame.speed ?? 0,
          presence: frame.presence ?? "on_job",
          timestamp: new Date(frame.timestamp).getTime()
        }
      ])
      return
    default:
      return
  }
}

export function useTelemetrySocket(): void {
  useEffect(() => {
    let socket: WebSocket | null = null
    let attempt = 0
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const connect = async () => {
      if (stopped) return
      try {
        const { token } = await authApi.streamToken()
        socket = new WebSocket(wsUrl(API_URL, token))
      } catch {
        timer = setTimeout(() => void connect(), reconnectDelay(attempt++))
        return
      }

      socket.onopen = () => {
        attempt = 0
      }
      socket.onmessage = event => {
        try {
          applyFrame(JSON.parse(String(event.data)) as LiveFrame)
        } catch {
          // Malformed frames are ignored — the refetch poll is the safety net.
        }
      }
      socket.onclose = () => {
        if (stopped) return
        timer = setTimeout(() => void connect(), reconnectDelay(attempt++))
      }
      socket.onerror = () => socket?.close()
    }

    void connect()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      socket?.close()
    }
  }, [])
}
