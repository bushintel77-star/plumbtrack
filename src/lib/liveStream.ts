import { config } from "./config"
import { enrollDeviceSession, getSession } from "./auth"
import { applyLiveFrame, refreshJobs, setLiveConnection } from "@/state/store"
import type { LiveFrame } from "./types"

/**
 * Live stream client — one WebSocket to /api/stream?token=<session>, frames
 * applied straight to the board store. Reconnect discipline mirrors HQ's
 * socket client: exponential backoff (1s → 30s cap) with jitter; on
 * reconnect the board reconciles with a fresh pull, so missed frames never
 * leave stale state. In demo mode a simulator drives the same apply path so
 * live behaviour is visible with zero backend.
 */

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

function reconnectDelay(attempt: number): number {
  const exponential = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt)
  return exponential + Math.random() * 500
}

export function startLiveStream(): () => void {
  if (config.forceDemo) return startDemoStream()

  let socket: WebSocket | null = null
  let attempt = 0
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const connect = async () => {
    if (stopped) return
    setLiveConnection("connecting")
    let session = await getSession()
    if (!session) session = await enrollDeviceSession()
    if (!session) {
      // No session yet (offline) — retry on the backoff schedule.
      timer = setTimeout(() => void connect(), reconnectDelay(attempt++))
      return
    }
    try {
      socket = new WebSocket(`${config.wsUrl}?token=${encodeURIComponent(session.token)}`)
    } catch {
      timer = setTimeout(() => void connect(), reconnectDelay(attempt++))
      return
    }

    socket.onopen = () => {
      attempt = 0
      setLiveConnection("live")
      // Reconcile anything missed while disconnected.
      void refreshJobs()
    }
    socket.onmessage = event => {
      try {
        applyLiveFrame(JSON.parse(String(event.data)) as LiveFrame)
      } catch {
        // Malformed frames are ignored — the reconcile pull is the safety net.
      }
    }
    socket.onclose = () => {
      if (stopped) return
      setLiveConnection("offline")
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
}

/** Demo simulator: scripted frames every 15s through the same apply path. */
function startDemoStream(): () => void {
  setLiveConnection("live")

  const script: LiveFrame[] = [
    { topic: "topic/jobs/status", jobId: "j-2003", status: "in_progress" },
    {
      topic: "topic/jobs/created",
      job: {
        id: "j-2005",
        client: "Petrov",
        address: "31 Hawthorn Rd, Caulfield North",
        scope: "Stormwater pit overflowing — jet and camera",
        phone: "0412 555 105",
        jobType: "blocked_drain",
        status: "scheduled",
        timeEntries: [],
        photos: [],
        serviceItems: []
      }
    },
    {
      topic: "topic/jobs/updated",
      jobId: "j-2002",
      patch: { scope: "Hot water unit service — tempering valve + relief valve replacement" }
    },
    { topic: "topic/jobs/status", jobId: "j-2003", status: "scheduled" }
  ]

  let index = 0
  const timer = setInterval(() => {
    applyLiveFrame(script[index % script.length])
    index += 1
  }, 15_000)

  return () => clearInterval(timer)
}
