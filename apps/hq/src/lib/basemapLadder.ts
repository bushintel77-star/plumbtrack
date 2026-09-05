/**
 * Basemap failure ladder — the pure state machine behind MapLibreView's
 * style-fallback behaviour. Providers blip (rate limits, cold CDN edges) for
 * seconds at a time and recover on their own, so a fatal style failure walks
 * every candidate, then restarts the ladder from the first candidate, and
 * only after the final pass dead-ends into the MAP UNAVAILABLE fallback.
 */

/** Seconds a candidate style gets to become ready before the ladder advances
 *  — generous enough for a cold deploy, short enough that a dead provider
 *  doesn't hold dispatch hostage. */
export const STYLE_READY_TIMEOUT_MS = 12_000

/** Full ladder passes before the MAP UNAVAILABLE dead-end. */
export const MAX_STYLE_LADDER_PASSES = 3

export interface LadderState {
  styleIndex: number
  ladderPass: number
}

/**
 * Next rung after a fatal failure of `state.styleIndex`. Returns the new
 * state (components remount the Map keyed on both values) or "give-up" once
 * every candidate has failed in every pass.
 */
export function advanceStyleLadder(
  state: LadderState,
  candidateCount: number
): LadderState | "give-up" {
  if (state.styleIndex + 1 < candidateCount) {
    return { styleIndex: state.styleIndex + 1, ladderPass: state.ladderPass }
  }
  if (state.ladderPass + 1 < MAX_STYLE_LADDER_PASSES) {
    return { styleIndex: 0, ladderPass: state.ladderPass + 1 }
  }
  return "give-up"
}

/**
 * Only genuinely-fatal map errors may advance the ladder. MapLibre fires
 * `error` for every failed tile/sprite while it keeps retrying those; a
 * single 404 or network abort must not collapse the whole map and lose
 * dispatch. Fatal: WebGL unavailable, an explicit auth failure (401/403),
 * or a style that outright failed to load.
 */
export function isFatalMapError(event: { error?: unknown }): boolean {
  const error = event.error as { message?: string; status?: number } | undefined
  const message = (error?.message ?? "").toLowerCase()
  if (message.includes("webgl")) return true
  if (error?.status === 401 || error?.status === 403) return true
  if (message.includes("style") && message.includes("failed")) return true
  return false
}
