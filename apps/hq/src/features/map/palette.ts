/**
 * Token bridge for WebGL paint properties. MapLibre resolves paint colors
 * in WebGL, where CSS `var(--…)` cannot follow — so concrete colors are
 * read from the computed Tier-1 tokens at render time. The map's colour
 * contract stays owned by the design system instead of hardcoded hexes:
 * active teal = billing-now work, urgent = emergency, pending = delayed/leave,
 * complete = green, en-route = chrome ramp, muted = scheduled/queued,
 * person-1..4 = per-tech
 * identity. Fallbacks are the dark-chassis values so an unreadable token
 * never produces an invisible layer.
 */

import type { Job } from "@/types"

export interface MapPalette {
  /** Active billing-now work. */
  active: string
  urgent: string
  pending: string
  complete: string
  enRoute: string
  neutral: string
  people: string[]
  vehicle: string
  breadcrumb: string
  pinStroke: string
  highlightStroke: string
}

const TOKENS = {
  active: "--status-active",
  urgent: "--status-urgent",
  pending: "--status-pending",
  complete: "--status-complete",
  enRoute: "--chrome-400",
  neutral: "--app-muted",
  person1: "--person-1",
  person2: "--person-2",
  person3: "--person-3",
  person4: "--person-4",
  person5: "--person-5",
  person6: "--person-6",
  person7: "--person-7",
  person8: "--person-8",
  breadcrumb: "--chrome-400",
  pinStroke: "--chassis-void",
  highlightStroke: "--app-on-accent"
} as const

const FALLBACKS: Record<string, string> = {
  "--chrome-600": "#1e56e0",
  "--chrome-400": "#4e8cff",
  "--status-urgent": "#ff3b30",
  "--status-active": "#14b8a6",
  "--status-pending": "#ff9f0a",
  "--status-complete": "#32d74b",
  "--app-muted": "#8b94a6",
  "--person-1": "#c27878",
  "--person-2": "#7a9e7e",
  "--person-3": "#b08d57",
  "--person-4": "#6b7d8d",
  "--person-5": "#8f7ab5",
  "--person-6": "#5f9ea0",
  "--person-7": "#a3b56b",
  "--person-8": "#c26d9d",
  "--chassis-void": "#071022",
  "--app-on-accent": "#ffffff"
}

/** Pure mapping: any unread token falls back to its dark-chassis value. */
export function resolvePalette(read: (token: string) => string): MapPalette {
  const get = (token: string): string => {
    const value = read(token).trim()
    return value || FALLBACKS[token] || ""
  }
  return {
    active: get(TOKENS.active),
    urgent: get(TOKENS.urgent),
    pending: get(TOKENS.pending),
    complete: get(TOKENS.complete),
    enRoute: get(TOKENS.enRoute),
    neutral: get(TOKENS.neutral),
    people: [TOKENS.person1, TOKENS.person2, TOKENS.person3, TOKENS.person4, TOKENS.person5, TOKENS.person6, TOKENS.person7, TOKENS.person8].map(get),
    vehicle: get(TOKENS.active),
    breadcrumb: get(TOKENS.breadcrumb),
    pinStroke: get(TOKENS.pinStroke),
    highlightStroke: get(TOKENS.highlightStroke)
  }
}

/** DOM wiring: reads the Tier-1 tokens off the themed root element. */
export function readComputedTokens(): (token: string) => string {
  if (typeof window === "undefined") return () => ""
  const styles = getComputedStyle(document.documentElement)
  return token => styles.getPropertyValue(token)
}

/** The one precedence law for map pin colour — mirrors `dispatchStatus` in
 *  lib/fieldloop exactly (complete > unassigned > urgent > state), so a job
 *  never reads as one colour on the board and another on the map. Amber
 *  (pending) marks unassigned work: it is the dispatcher's action queue. */
export function statusColor(
  job: Pick<Job, "status" | "priority" | "techId">,
  palette: MapPalette
): string {
  if (job.status === "complete") return palette.complete
  if (job.status === "unassigned" || !job.techId) return palette.pending
  if (job.priority === "emergency" || job.status === "delayed") return palette.urgent
  if (job.status === "active") return palette.active
  if (job.status === "en_route") return palette.enRoute
  return palette.neutral
}

/** Crew identity colour: one hue per technician, shared by their route line
 *  and vehicle dot so "whose line is this" is answerable at a glance. Index
 *  is the roster position, so a tech keeps their colour between renders.
 *  Rosters beyond the four person tokens cycle — acceptable today, but a
 *  wider identity ramp is owed before large crews onboard. */
export function personColor(index: number, palette: MapPalette): string {
  return palette.people[index % palette.people.length]
}
