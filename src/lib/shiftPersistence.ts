import AsyncStorage from "@react-native-async-storage/async-storage"
import { createActor, type Actor } from "xstate"

import { shiftMachine, type ShiftMachineContext } from "./shiftMachine"

/**
 * Durable shift actor — the shift must survive an app crash or phone
 * restart mid-shift (a plumber on a roof cannot re-log-on to keep their
 * payable time). XState v5 persisted snapshots serialize the statechart
 * exactly; on boot the actor resumes where it left off. AsyncStorage is
 * the right-sized store for one snapshot — the outbox pattern scales to
 * SQLite later if device-local history outgrows it.
 *
 * Creation is async (snapshot read), so the root layout binds the actor
 * before the app becomes interactive; the fonts gate already covers the
 * sub-millisecond restore window.
 */

const SNAPSHOT_KEY = "plumbtrack-shift-snapshot"

export type ShiftActor = Actor<typeof shiftMachine>
export type PersistedShiftSnapshot = ReturnType<ShiftActor["getPersistedSnapshot"]>

async function loadSnapshot(): Promise<PersistedShiftSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY)
    return raw ? (JSON.parse(raw) as PersistedShiftSnapshot) : null
  } catch {
    return null
  }
}

async function persistSnapshot(snapshot: PersistedShiftSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot))
  } catch {
    // Persistence is best-effort; the live shift keeps running in memory.
  }
}

/** Create the shift actor, restoring any persisted mid-shift snapshot. */
export async function createDurableShiftActor(): Promise<ShiftActor> {
  const snapshot = await loadSnapshot()
  const actor = createActor(shiftMachine, snapshot ? { snapshot } : undefined)
  actor.subscribe(() => void persistSnapshot(actor.getPersistedSnapshot()))
  actor.start()
  return actor
}

/** Test helper: read back what was persisted. */
export async function readPersistedShift(): Promise<PersistedShiftSnapshot | null> {
  return loadSnapshot()
}

/** Test helper. */
export async function clearPersistedShift(): Promise<void> {
  await AsyncStorage.removeItem(SNAPSHOT_KEY)
}

export type { ShiftMachineContext }
