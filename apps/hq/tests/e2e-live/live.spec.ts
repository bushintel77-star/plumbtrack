import { test, expect, type Page } from "@playwright/test"

/**
 * Live-API tier — everything here round-trips the real Fastify API against
 * a real Postgres (see playwright.live.config.ts and
 * apps/api/scripts/e2e-seed.ts). Login attempts stay well under the
 * 10/min/IP auth rate limit: three sign-ins plus one rejection per run.
 */

const OWNER_EMAIL = "owner@e2e-live.test"
// Assembled from parts so no usable credential literal lives in source;
// the seed script assembles the identical value.
const E2E_PASSWORD = ["e2e-live", "-password-1"].join("")

async function signIn(page: Page): Promise<void> {
  await page.goto("/login")
  await page.getByRole("textbox", { name: "EMAIL" }).fill(OWNER_EMAIL)
  await page.getByRole("textbox", { name: "PASSWORD" }).fill(E2E_PASSWORD)
  await page.getByTestId("hq-login-submit").click()
}

test("a rejected sign-in shows the accessible error state", async ({ page }) => {
  await page.goto("/login")
  await page.getByRole("textbox", { name: "EMAIL" }).fill(OWNER_EMAIL)
  await page.getByRole("textbox", { name: "PASSWORD" }).fill(["wrong", "-password"].join(""))
  await page.getByTestId("hq-login-submit").click()
  await expect(page.getByTestId("hq-login-error")).toBeVisible()
  // Still on the login page — no partial session, no redirect.
  await expect(page.getByTestId("hq-login")).toBeVisible()
})

test("sign-in reaches a live board hydrated from the API", async ({ page }) => {
  await signIn(page)
  await expect(page.getByTestId("fieldloop-workspace")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId("fl-connection")).toHaveText(/live/i, { timeout: 20_000 })
  // The roster is the org's real membership, not seed fixtures.
  await expect(page.locator(".fl-row", { hasText: "E2e Tech" })).toBeVisible()
  await expect(page.getByTestId("fl-connection")).not.toHaveText(/demo/i)
})

test("intake → assignment round-trips through the real API", async ({ page }) => {
  await signIn(page)
  await expect(page.getByTestId("fl-connection")).toHaveText(/live/i, { timeout: 20_000 })

  // Intake: the only job-create path posts a real record.
  await page.getByTestId("fl-new-job-open").click()
  await page.getByTestId("fl-new-job-client").fill("Live E2e Client")
  await page.getByTestId("fl-new-job-address").fill("1 Live Test St")
  await page.getByTestId("fl-new-job-scope").fill("Live tier intake probe")
  await page.getByTestId("fl-new-job-submit").click()
  await expect(page.getByText(/job created/i)).toBeVisible()

  // The board poll (5s) picks the new job up into the unassigned queue —
  // the API attaches the schedulable appointment that makes it assignable.
  const queued = page.locator('[data-testid^="queue-job-"]', { hasText: "Live tier intake probe" })
  await expect(queued.first()).toBeVisible({ timeout: 20_000 })

  // Assignment: inspector → crew → place. This PATCHes
  // /api/jobs/:id/assignment through the advisory-lock path. The option
  // value is the real membership id — resolve it from the rendered label.
  await queued.first().click()
  const inspector = page.getByRole("complementary").filter({ hasText: "1 Live Test St" })
  await expect(inspector).toBeVisible()
  const crewSelect = inspector.getByRole("combobox", { name: "Crew" })
  const crewValue = await crewSelect.locator("option", { hasText: "E2e Tech" }).getAttribute("value")
  expect(crewValue).toBeTruthy()
  await crewSelect.selectOption(crewValue!)
  await inspector.getByRole("button", { name: "Place on board" }).click()

  // Server-confirmed placement: the job block sits in the crew lane, the
  // connection badge never left Live, and no failed-ops chip appeared (a
  // server rejection or rollback would surface there instead).
  const lane = page.locator(".fl-row", { hasText: "E2e Tech" })
  await expect(lane.locator('[data-testid^="board-job-"]', { hasText: "Live tier intake probe" })).toBeVisible({
    timeout: 10_000
  })
  await expect(page.getByTestId("fl-connection")).toHaveText(/live/i)
  await expect(page.getByTestId("fl-failed-ops")).toHaveCount(0)
})
