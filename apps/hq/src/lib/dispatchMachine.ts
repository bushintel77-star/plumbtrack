import { createMachine } from "xstate"

export const dispatchInteractionMachine = createMachine({
  id: "dispatchInteraction",
  initial: "idle",
  states: {
    idle: { on: { SELECT_JOB: "selected", START_DRAG: "dragging" } },
    selected: { on: { CLEAR: "idle", START_DRAG: "dragging" } },
    dragging: { on: { HOVER_VALID: "draggingValid", HOVER_INVALID: "draggingInvalid", CANCEL: "idle", DROP: "committing" } },
    draggingValid: { on: { HOVER_INVALID: "draggingInvalid", CANCEL: "idle", DROP: "committing" } },
    draggingInvalid: { on: { HOVER_VALID: "draggingValid", CANCEL: "idle", DROP: "idle" } },
    committing: { on: { SUCCESS: "selected", FAILURE: "selected" } }
  }
})
