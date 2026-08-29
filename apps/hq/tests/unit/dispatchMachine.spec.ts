import { describe, expect, it } from "vitest"
import { createActor } from "xstate"

import { dispatchInteractionMachine } from "@/lib/dispatchMachine"

function machine() {
  return createActor(dispatchInteractionMachine).start()
}

describe("dispatchInteractionMachine (drag lifecycle FSM)", () => {
  it("starts idle and reaches dragging on START_DRAG", () => {
    const actor = machine()
    expect(actor.getSnapshot().value).toBe("idle")
    actor.send({ type: "START_DRAG" })
    expect(actor.getSnapshot().value).toBe("dragging")
  })

  it("tracks hover validity while dragging", () => {
    const actor = machine()
    actor.send({ type: "START_DRAG" })
    actor.send({ type: "HOVER_VALID" })
    expect(actor.getSnapshot().value).toBe("draggingValid")
    actor.send({ type: "HOVER_INVALID" })
    expect(actor.getSnapshot().value).toBe("draggingInvalid")
    actor.send({ type: "HOVER_VALID" })
    expect(actor.getSnapshot().value).toBe("draggingValid")
  })

  it("commits only from a valid hover and returns to selected on SUCCESS/FAILURE", () => {
    const actor = machine()
    actor.send({ type: "START_DRAG" })
    actor.send({ type: "HOVER_VALID" })
    actor.send({ type: "DROP" })
    expect(actor.getSnapshot().value).toBe("committing")
    actor.send({ type: "FAILURE" })
    expect(actor.getSnapshot().value).toBe("selected")
    actor.send({ type: "START_DRAG" })
    actor.send({ type: "HOVER_VALID" })
    actor.send({ type: "DROP" })
    actor.send({ type: "SUCCESS" })
    expect(actor.getSnapshot().value).toBe("selected")
  })

  it("an invalid drop never reaches committing — it falls back to idle", () => {
    const actor = machine()
    actor.send({ type: "START_DRAG" })
    actor.send({ type: "HOVER_INVALID" })
    actor.send({ type: "DROP" })
    expect(actor.getSnapshot().value).toBe("idle")
  })

  it("CANCEL aborts from any dragging state", () => {
    for (const state of ["dragging", "draggingValid", "draggingInvalid"] as const) {
      const actor = machine()
      actor.send({ type: "START_DRAG" })
      if (state !== "dragging") actor.send({ type: state === "draggingValid" ? "HOVER_VALID" : "HOVER_INVALID" })
      actor.send({ type: "CANCEL" })
      expect(actor.getSnapshot().value).toBe("idle")
    }
  })

  it("ignores drop-channel events when idle (no phantom commits)", () => {
    const actor = machine()
    actor.send({ type: "DROP" })
    actor.send({ type: "SUCCESS" })
    expect(actor.getSnapshot().value).toBe("idle")
  })
})
