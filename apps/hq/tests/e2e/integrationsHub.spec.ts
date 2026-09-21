import { test, expect } from "@playwright/test"

/**
 * The Integrations hub (?module=integrations) in the deterministic tier:
 * FORCE_DEMO has no API, so the surface must render its honest states — the
 * deep link reaches the real hub (not the placeholder card), and without an
 * API it says so instead of inventing a provider catalog.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/?module=integrations")
})

test("the deep link reaches the real hub, not the placeholder module", async ({ page }) => {
  await expect(page.getByTestId("integrations-surface").or(page.getByRole("alert"))).toBeVisible({
    timeout: 20_000
  })
  // The placeholder card would mean the module was never wired.
  await expect(page.getByText(/scheduled for milestone/i)).toHaveCount(0)
})

test("without an API the hub says so instead of inventing a catalog", async ({ page }) => {
  // Scope off Next's route announcer, which also carries role="alert".
  const alert = page.locator('p[role="alert"]')
  await expect(alert).toBeVisible({ timeout: 20_000 })
  await expect(alert).toContainText(/couldn't load integrations/i)
  // And nothing fabricated appears in its place.
  await expect(page.getByTestId("integration-card-xero")).toHaveCount(0)
})
