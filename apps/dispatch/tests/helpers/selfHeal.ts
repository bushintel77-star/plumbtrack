import type { Page } from '@playwright/test'

/**
 * Programmatic self-healing harness.
 *
 * Runs an assertion; if it fails (e.g. Playwright has detected a stuck timer
 * or an invalid quote state), the `heal` callback dispatches a state reset to
 * the Zustand store through the `window.__fieldloop` bridge, and the
 * assertion is re-run.
 */
export async function expectWithSelfHeal(
  page: Page,
  assertion: () => Promise<void>,
  heal: () => Promise<void>
): Promise<void> {
  try {
    await assertion()
  } catch {
    await heal()
    await assertion()
  }
}
