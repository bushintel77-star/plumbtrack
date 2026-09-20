import { test, expect } from "@playwright/test"

/**
 * The dispatch board: deterministic seed hydration, zoom levels, day paging,
 * selection, and the new-job intake's honest not-connected refusal (creates
 * are live-API only by design — there is no offline queue for intake).
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/")
})

test("the day board hydrates from the seed", async ({ page }) => {
  await expect(page.getByTestId("fl-day-board")).toBeVisible()
  // Assigned today: j-1002 + j-1003 on Mike, j-1005 on Carlos.
  await expect(page.getByTestId("board-job-j-1002")).toBeVisible()
  await expect(page.getByTestId("board-job-j-1003")).toBeVisible()
  // Unassigned today renders in the queue lane.
  await expect(page.getByTestId("queue-job-j-1001")).toBeVisible()
  await expect(page.getByTestId("queue-job-j-1007")).toBeVisible()
  await expect(page.getByTestId("queue-job-j-1008")).toBeVisible()
  // North-star strip counts today's work.
  await expect(page.getByText(/\d+ jobs? · \d+ complete/)).toBeVisible()
  await expect(page.getByTestId("fl-attention-count")).toBeVisible()
})

test("crew rows show presence and vanes", async ({ page }) => {
  const mike = page.locator(".fl-row", { hasText: "Mike Reyes" })
  await expect(mike).toBeVisible()
  await expect(mike.getByText(/Van 2/)).toBeVisible()
  // Priya is on approved leave today — the lane is marked, not hidden.
  const priya = page.locator(".fl-row", { hasText: "Priya Nair" })
  await expect(priya.locator(".fl-lane")).toHaveClass(/leave/)
})

test("the zoom switcher swaps board, week grid and month calendar", async ({ page }) => {
  const zoom = page.getByRole("group", { name: "Board zoom" })
  await zoom.getByRole("button", { name: "Week" }).click()
  await expect(page.getByTestId("fl-week-grid")).toBeVisible()
  await zoom.getByRole("button", { name: "Month" }).click()
  await expect(page.getByTestId("fl-calendar-grid")).toBeVisible()
  await zoom.getByRole("button", { name: "Day" }).click()
  await expect(page.getByTestId("fl-day-board")).toBeVisible()
})

test("paging days moves the board and offers a way back to today", async ({ page }) => {
  const label = page.getByTestId("fl-day-label")
  const todayText = await label.textContent()
  await page.getByRole("button", { name: "Next day" }).click()
  await expect(label).not.toHaveText(todayText ?? "")
  // Tomorrow carries j-1009 (Northgate Stage 1, Dana).
  await expect(page.getByTestId("board-job-j-1009")).toBeVisible()
  // A stale date becomes a one-click return, never a stranded board.
  await page.getByRole("button", { name: /back to today/i }).click()
  await expect(label).toHaveText(todayText ?? "")
})

test("selecting a job opens the inspector scoped to it", async ({ page }) => {
  await page.getByTestId("board-job-j-1002").click()
  await expect(page.getByRole("complementary", { name: "Boiler Annual Service" })).toBeVisible()
  // Selection lives in the URL — a copied link points at this job.
  await expect(page).toHaveURL(/job=j-1002/)
})

test("new-job intake opens, validates, and honestly refuses without a live API", async ({ page }) => {
  await page.getByTestId("fl-new-job-open").click()
  const form = page.getByTestId("fl-new-job-form")
  await expect(form).toBeVisible()
  await page.getByTestId("fl-new-job-client").fill("E2e Client")
  await page.getByTestId("fl-new-job-address").fill("1 Test St")
  await page.getByTestId("fl-new-job-scope").fill("E2e intake probe")
  await page.getByTestId("fl-new-job-submit").click()
  // Deterministic tier has no API: the form says so instead of pretending
  // a queued job exists (there is deliberately no offline queue for creates).
  await expect(page.getByText(/new jobs need a live api connection/i)).toBeVisible()
  // Nothing was fabricated into the queue.
  await expect(page.getByText("E2e intake probe")).toHaveCount(0)
})
