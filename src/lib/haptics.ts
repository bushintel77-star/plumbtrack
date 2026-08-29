import * as Haptics from "expo-haptics"

/**
 * Tactile commit feedback (mobile-fsm-ui-design §motion): gloves defeat
 * haptic subtlety, so every XState commit that changes the billing day
 * fires a distinct, noticeable pattern — the worker feels the transition
 * land without looking. Patterns are deliberately differentiated:
 * success-style light for starts, medium for ends, heavy for the shift
 * log-on/log-off bookends. Web (no haptics) is a silent no-op.
 */

async function fire(pattern: Haptics.ImpactFeedbackStyle): Promise<void> {
  try {
    await Haptics.impactAsync(pattern)
  } catch {
    // Web preview / device without haptics — silent.
  }
}

export const hapticShiftCommitted = {
  logOn: () => void fire(Haptics.ImpactFeedbackStyle.Heavy),
  logOff: () => void fire(Haptics.ImpactFeedbackStyle.Heavy),
  breakStart: () => void fire(Haptics.ImpactFeedbackStyle.Light),
  breakEnd: () => void fire(Haptics.ImpactFeedbackStyle.Light),
  clockStart: () => void fire(Haptics.ImpactFeedbackStyle.Medium),
  clockStop: () => void fire(Haptics.ImpactFeedbackStyle.Medium),
  jobComplete: () => void fire(Haptics.ImpactFeedbackStyle.Heavy)
}
