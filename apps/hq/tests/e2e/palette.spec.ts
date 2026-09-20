import { test, expect } from "@playwright/test"

/**
 * The ⌘K command palette: opens from the keyboard, filters jobs and crew,
 * and a picked job navigates the board to that job's day with ?job= set.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("fieldloop-workspace")).toBeVisible()
})

test("⌘K opens the palette and Escape closes it", async ({ page }) => {
  await page.keyboard.press("Control+k")
  const palette = page.getByRole("dialog", { name: "Command palette" })
  await expect(palette).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(palette).toHaveCount(0)
})

test("the topbar search button opens the same palette", async ({ page }) => {
  await page.getByRole("button", { name: /search jobs and crew/i }).click()
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible()
})

test("typing filters the hits; no match is honest", async ({ page }) => {
  await page.keyboard.press("Control+k")
  const palette = page.getByRole("dialog", { name: "Command palette" })
  await palette.getByRole("textbox", { name: "Search jobs and crew" }).fill("drainage")
  await expect(palette.getByRole("button", { name: /emergency drainage/i })).toBeVisible()
  await palette.getByRole("textbox", { name: "Search jobs and crew" }).fill("zzz-no-match-zzz")
  await expect(palette.getByText(/nothing matches/i)).toBeVisible()
})

test("picking a job navigates the board to that job", async ({ page }) => {
  await page.keyboard.press("Control+k")
  const palette = page.getByRole("dialog", { name: "Command palette" })
  await palette.getByRole("textbox", { name: "Search jobs and crew" }).fill("drainage")
  await palette.getByRole("button", { name: /emergency drainage/i }).click()
  await expect(palette).toHaveCount(0)
  // The board follows the hit: dispatch surface, job selected in the URL,
  // inspector scoped to the job.
  await expect(page.locator(".fl-section")).toHaveText("Dispatch")
  await expect(page).toHaveURL(/job=j-1001/)
  await expect(page.getByRole("complementary", { name: "Emergency Drainage" })).toBeVisible()
})
