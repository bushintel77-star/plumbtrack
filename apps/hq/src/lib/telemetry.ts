"use client"

import { useEffect, useRef } from "react"
import { throttle } from "lodash-es"
import { useBoardStore, type LiveLocation } from "@/stores/boardStore"
import type { Job } from "@/types"

/**
 * Real-time telemetry architecture (research §Phase 1):
 *
 * `useTelemetrySocket` maintains a persistent authenticated WebSocket to the
 * telemetry gateway and subscribes to two channels:
 *   - topic/jobs/status     → state transitions applied to the store dict
 *   - topic/fleet/telemetry → GPS pings, ingested through a 1s throttle so
 *                             high-frequency streams never block the main
 *                             thread with continuous render cycles.
 *
 * When no gateway is configured (NEXT_PUBLIC_HQ_WS_URL empty — the current
 * Fastify API is REST-only until M2), the hook degrades gracefully: polling
 * keeps driving the board, and the built-in simulator (enabled for demo/test
 * builds) feeds the same throttled pipeline so the live map is exercisable.
 */

const WS_URL = process.env.NEXT_PUBLIC_HQ_WS_URL ?? ""
const SIMULATE = process.env.NEXT_PUBLIC_HQ_TELEMETRY_SIM === "1"

interface StatusMessage {
  topic: "topic/jobs/status"
  jobId: string
  status: Job["status"]
}

interface TelemetryMessage {
  topic: "topic/fleet/telemetry"
  payload: LiveLocation
}

export function useTelemetrySocket(): void {
  useEffect(() => {
    const flush = throttle((pings: LiveLocation[]) => {
      useBoardStore.getState().mergeLiveLocations(pings)
    }, 1000)
    let socket: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    let attempt = 0

    const connect = (): void => {
      if (stopped || !WS_URL) return
      try {
        socket = new WebSocket(WS_URL)
      } catch {
        scheduleReconnect()
        return
      }
      socket.onopen = () => {
        attempt = 0
        useBoardStore.getState().setDataMode("live")
      }
      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const message = JSON.parse(event.data) as StatusMessage | TelemetryMessage
          if (message.topic === "topic/jobs/status") useBoardStore.getState().applyRemoteStatus(message.jobId, message.status)
          else if (message.topic === "topic/fleet/telemetry") flush([message.payload])
        } catch {
          // Ignore malformed frames; the connection remains usable.
        }
      }
      socket.onerror = () => socket?.close()
      socket.onclose = () => {
        socket = null
        if (!stopped) {
          useBoardStore.getState().setDataMode("connecting")
          scheduleReconnect()
        }
      }
    }

    const scheduleReconnect = (): void => {
      if (stopped || retryTimer) return
      const delay = Math.min(30_000, 1_000 * 2 ** attempt) + Math.floor(Math.random() * 500)
      attempt += 1
      retryTimer = setTimeout(() => { retryTimer = null; connect() }, delay)
    }

    if (WS_URL) connect()
    const stopSimulation = !WS_URL && SIMULATE ? startTelemetrySimulator(ping => flush([ping])) : null
    return () => {
      stopped = true
      if (retryTimer) clearTimeout(retryTimer)
      socket?.close()
      stopSimulation?.()
      flush.cancel()
    }
  }, [])
}

/* ── Demo simulator ────────────────────────────────────────────────────────
 * Moves each vehicle along its technician's route for the day, one ping per
 * 900ms, producing { vehicleId, lat, lng, heading, speed, timestamp } frames
 * identical in shape to the real fleet stream. */

interface SimulatorPing {
  vehicleId: string
  lat: number
  lng: number
  heading: number
  speed: number
  timestamp: number
}

function bearing(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const dy = to.lat - from.lat
  const dx = to.lng - from.lng
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

function startTelemetrySimulator(emit: (ping: SimulatorPing) => void): () => void {
  const timer = setInterval(() => {
    const state = useBoardStore.getState()
    const day = new Date().toISOString().slice(0, 10)
    const t = (Date.now() / 9000) % 1 // lap position along the route

    for (const vehicle of state.vehicles) {
      const stops = Object.values(state.jobs)
        .filter(
          j => j.techId === vehicle.techId && j.location && (!j.scheduledDate || j.scheduledDate === day)
        )
        .sort((a, b) => a.startBlock - b.startBlock)
        .map(j => j.location!)
      if (stops.length === 0) continue

      const segment = Math.min(stops.length - 1, Math.floor(t * (stops.length - 1 + 1)))
      const from = stops[Math.min(segment, stops.length - 1)]
      const to = stops[Math.min(segment + 1, stops.length - 1)]
      const legT = (t * stops.length) % 1
      emit({
        vehicleId: vehicle.id,
        lat: from.lat + (to.lat - from.lat) * legT,
        lng: from.lng + (to.lng - from.lng) * legT,
        heading: bearing(from, to),
        speed: 34 + Math.round(Math.sin(Date.now() / 2000) * 6),
        timestamp: Date.now()
      })
    }
  }, 900)

  return () => clearInterval(timer)
}
