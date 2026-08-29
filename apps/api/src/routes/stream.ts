import type { FastifyInstance } from "fastify"
import websocket from "@fastify/websocket"

import { verifyAuthToken } from "../lib/auth"
import { subscribeOrg, type LiveFrame } from "../lib/liveBus"

/**
 * Live stream endpoint — WebSocket at /api/stream?token=<session token>.
 *
 * The token rides the query string because browser WebSockets cannot set
 * headers; production runs behind TLS so it is never cleartext on the wire.
 * Every frame is org-scoped: the channel is chosen from the VERIFIED token
 * claims, never from client input, so one tenant can never subscribe to
 * another's board. Missed frames are reconciled by the client's
 * refresh-on-reconnect.
 */

const HEARTBEAT_MS = 30_000

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  await app.register(websocket)

  app.get("/api/stream", { websocket: true }, (socket, request) => {
    const url = new URL(request.url, "http://internal")
    const token = url.searchParams.get("token")
    const claims = token ? verifyAuthToken(token) : null
    if (!claims) {
      socket.send(JSON.stringify({ topic: "topic/stream/error", reason: "unauthorized" }))
      socket.close()
      return
    }

    const orgId = claims.organizationId
    let heartbeat: ReturnType<typeof setInterval> | null = null

    const unsubscribe = subscribeOrg(orgId, (frame: LiveFrame) => {
      socket.send(JSON.stringify(frame))
    })

    socket.send(JSON.stringify({ topic: "topic/stream/hello", orgId }))
    heartbeat = setInterval(() => {
      // Probe dead connections; a failed send triggers the close path.
      try {
        socket.send(JSON.stringify({ topic: "topic/stream/ping" }))
      } catch {
        socket.close()
      }
    }, HEARTBEAT_MS)

    socket.on("close", () => {
      if (heartbeat) clearInterval(heartbeat)
      unsubscribe()
    })
  })
}
