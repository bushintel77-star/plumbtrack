"use client"

/**
 * Intentionally disabled by FieldLoop's locked location policy.
 * Technician location is captured only at clock-in and clock-out. This
 * compatibility hook remains so older imports cannot accidentally re-enable
 * continuous tracking.
 */
export function useTelemetrySocket(): void {
  // No WebSocket, simulator, polling, throttling, or location ingestion.
}
