import { assign, setup } from "xstate"

import type { ShiftBreak, ShiftWorkType } from "@/types"

/**
 * Shift lifecycle statechart (MA000036 field flow) — the mobile sibling of
 * HQ's dispatch drag machine: one machine owns the legal shift transitions
 * AND the shift's working data (breaks, log-on evidence), so the UI can
 * never drive an award-noncompliant sequence — no break without a shift,
 * no double log-on, and log-off from any active state (an open break
 * simply runs to the shift's end per the award engine's interpretation:
 * unpaid, excluded from payable time).
 *
 *   idle → onShift ⇄ onBreak → idle
 */
export interface ShiftMachineContext {
  shiftId: string
  workType: ShiftWorkType
  loggedOnAt: string | null
  logOnLat: number | null
  logOnLng: number | null
  breaks: ShiftBreak[]
  /** Finalisation fields, set by LOG_OFF and consumed by the store mirror. */
  loggedOffAt: string | null
  kmDriven: number | null
  toilElection: boolean
}

export type ShiftMachineEvent =
  | { type: "LOG_ON"; workType: ShiftWorkType; lat: number | null; lng: number | null }
  | { type: "START_BREAK" }
  | { type: "END_BREAK" }
  | { type: "LOG_OFF"; kmDriven?: number; toilElection?: boolean }

const stamp = () => new Date().toISOString()

export const shiftMachine = setup({
  types: {
    context: {} as ShiftMachineContext,
    events: {} as ShiftMachineEvent
  },
  actions: {
    /** Close any open break — used on END_BREAK and LOG_OFF. */
    closeOpenBreak: assign({
      breaks: ({ context }) =>
        context.breaks.map(brk => (brk.end === null ? { ...brk, end: stamp() } : brk))
    }),
    /** Stamp the log-off finalisation fields after closing any open break. */
    finaliseShift: assign(({ context, event }) => {
      const closedBreaks = context.breaks.map(brk => (brk.end === null ? { ...brk, end: stamp() } : brk))
      const logOff = event.type === "LOG_OFF" ? event : { kmDriven: undefined, toilElection: undefined }
      return {
        breaks: closedBreaks,
        loggedOffAt: stamp(),
        kmDriven: logOff.kmDriven ?? null,
        toilElection: logOff.toilElection ?? false
      }
    })
  }
}).createMachine({
  id: "shift",
  initial: "idle",
  context: {
    shiftId: "",
    workType: "standard",
    loggedOnAt: null,
    logOnLat: null,
    logOnLng: null,
    breaks: [],
    loggedOffAt: null,
    kmDriven: null,
    toilElection: false
  },
  states: {
    idle: {
      on: {
        LOG_ON: {
          target: "onShift",
          actions: assign({
            shiftId: () => `shift-${Date.now().toString(36)}`,
            workType: ({ event }) => event.workType,
            loggedOnAt: stamp,
            logOnLat: ({ event }) => event.lat,
            logOnLng: ({ event }) => event.lng,
            breaks: [],
            loggedOffAt: null,
            kmDriven: null,
            toilElection: false
          })
        }
      }
    },
    onShift: {
      on: {
        START_BREAK: {
          target: "onBreak",
          actions: assign({
            breaks: ({ context }) => [...context.breaks, { start: stamp(), end: null }]
          })
        },
        LOG_OFF: { target: "idle", actions: "finaliseShift" }
      }
    },
    onBreak: {
      on: {
        END_BREAK: { target: "onShift", actions: "closeOpenBreak" },
        LOG_OFF: { target: "idle", actions: "finaliseShift" }
      }
    }
  }
})
