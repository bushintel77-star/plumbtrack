import { beforeEach, describe, expect, it, vi } from "vitest"

import { createActor } from "xstate"
import { shiftMachine } from "@/lib/shiftMachine"
import {
  clearPersistedShift,
  createDurableShiftActor,
  readPersistedShift
} from "@/lib/shiftPersistence"

const storage = new Map<string, string>()
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => void storage.set(key, value),
    removeItem: async (key: string) => void storage.delete(key)
  }
}))
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined
}))
vi.mock("expo-haptics", () => ({
  impactAsync: async () => undefined,
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" }
}))

beforeEach(() => {
  storage.clear()
})

describe("shift lifecycle statechart (XState v5)", () => {
  it("runs the legal day: log on → break ⇄ work → log off", () => {
    const actor = createActor(shiftMachine).start()
    actor.send({ type: "LOG_ON", workType: "callback", lat: -37.9, lng: 145.0 })
    expect(actor.getSnapshot().value).toBe("onShift")
    expect(actor.getSnapshot().context.workType).toBe("callback")

    actor.send({ type: "START_BREAK" })
    expect(actor.getSnapshot().value).toBe("onBreak")
    expect(actor.getSnapshot().context.breaks).toHaveLength(1)

    actor.send({ type: "END_BREAK" })
    expect(actor.getSnapshot().value).toBe("onShift")
    expect(actor.getSnapshot().context.breaks[0].end).not.toBeNull()

    actor.send({ type: "LOG_OFF", kmDriven: 40, toilElection: true })
    const final = actor.getSnapshot()
    expect(final.value).toBe("idle")
    expect(final.context.loggedOffAt).toBeTruthy()
    expect(final.context.kmDriven).toBe(40)
    expect(final.context.toilElection).toBe(true)
  })

  it("structurally rejects illegal sequences — the UI can never drive them", () => {
    // Break without a shift
    const noShift = createActor(shiftMachine).start()
    noShift.send({ type: "START_BREAK" })
    expect(noShift.getSnapshot().value).toBe("idle")

    // Double log-on, double break
    const actor = createActor(shiftMachine).start()
    actor.send({ type: "LOG_ON", workType: "standard", lat: null, lng: null })
    actor.send({ type: "LOG_ON", workType: "standard", lat: null, lng: null })
    actor.send({ type: "START_BREAK" })
    actor.send({ type: "START_BREAK" })
    expect(actor.getSnapshot().context.breaks).toHaveLength(1)

    // Log-off from onBreak is legal and closes the open break
    actor.send({ type: "LOG_OFF" })
    const final = actor.getSnapshot()
    expect(final.value).toBe("idle")
    expect(final.context.breaks.every(brk => brk.end !== null)).toBe(true)
  })
})

describe("durable shift actor (crash mid-shift recovery)", () => {
  it("persists the snapshot on every transition", async () => {
    const actor = await createDurableShiftActor()
    actor.send({ type: "LOG_ON", workType: "inclement", lat: null, lng: null })
    // getPersistedSnapshot's public typing is loose (Snapshot<unknown>) —
    // cast to the concrete serialized shape we own.
    const persisted = (await readPersistedShift()) as { context: { workType: string } } | null
    expect(persisted?.context.workType).toBe("inclement")

    // What lands on disk must be enough to reboot into the same state.
    const rebooted = await createDurableShiftActor()
    expect(rebooted.getSnapshot().value).toBe("onShift")
    expect(rebooted.getSnapshot().context.workType).toBe("inclement")
  })

  it("restores a mid-shift snapshot on the next boot", async () => {
    const first = await createDurableShiftActor()
    first.send({ type: "LOG_ON", workType: "standard", lat: -37.9, lng: 145.0 })
    first.send({ type: "START_BREAK" })
    await clearPersistedShift // keep the persisted state, drop the actor

    const rebooted = await createDurableShiftActor()
    const snapshot = rebooted.getSnapshot()
    expect(snapshot.value).toBe("onBreak")
    expect(snapshot.context.workType).toBe("standard")
    expect(snapshot.context.breaks).toHaveLength(1)
    expect(snapshot.context.loggedOnAt).toBeTruthy()
  })

  it("a fresh boot with no snapshot starts idle", async () => {
    const actor = await createDurableShiftActor()
    expect(actor.getSnapshot().value).toBe("idle")
  })
})
