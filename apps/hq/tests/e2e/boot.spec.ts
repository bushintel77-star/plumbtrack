import { test, expect } from "@playwright/test"

/**
 * Boot + navigation — the Crewline workspace shell. Deterministic tier: the
 * build carries NEXT_PUBLIC_HQ_FORCE_DEMO=1, which bypasses the auth gate
 * and latches the board to seed data (t-mike/t-dana/t-carlos/t-priya,
 * j-1001…j-1010), so no API or database is needed.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/")
})

test("boots the Crewline workspace with the honest demo badge", async ({ page }) => {
  await expect(page.getByTestId("fieldloop-workspace")).toBeVisible()
  // FORCE_DEMO renders the static span (not the reconnect button) — the
  // suite's data source is always explicit.
  await expect(page.getByTestId("fl-connection")).toHaveText(/demo data/i)
})

test("the rail navigates every surface and marks the active one", async ({ page }) => {
  const rail = page.getByRole("navigation", { name: "Surfaces" })
  await expect(rail).toBeVisible()
  const cases: Array<[string, string]> = [
    ["Map", "Map"],
    ["Documents", "Documents"],
    ["Customers", "Customers"],
    ["Reports", "Reports"],
    ["Slack", "Slack"],
    ["Dispatch", "Dispatch"]
  ]
  for (const [label, section] of cases) {
    const button = rail.getByRole("button", { name: label })
    await button.click()
    await expect(button).toHaveAttribute("aria-current", "page")
    await expect(page.locator(".fl-section")).toHaveText(section)
  }
})

test("?surface= deep links straight to a surface", async ({ page }) => {
  await page.goto("/?surface=crm")
  await expect(page.locator(".fl-section")).toHaveText("Customers")
  await expect(
    page.getByRole("navigation", { name: "Surfaces" }).getByRole("button", { name: "Customers" })
  ).toHaveAttribute("aria-current", "page")
})

test("legacy ?module= links map onto Crewline surfaces", async ({ page }) => {
  await page.goto("/?module=customers")
  await expect(page.locator(".fl-section")).toHaveText("Customers")
  await page.goto("/?module=slack")
  await expect(page.locator(".fl-section")).toHaveText("Slack")
})

test("the topbar COMMS control opens the Slack surface", async ({ page }) => {
  await page.getByTestId("comms-trigger").click()
  await expect(page.locator(".fl-section")).toHaveText("Slack")
})

test("topbar chrome is present: search, copy link, sign out", async ({ page }) => {
  await expect(page.getByRole("button", { name: /search jobs and crew/i })).toBeVisible()
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible()
  await expect(page.getByTestId("fl-sign-out")).toBeVisible()
})

test("the failed-ops chip is absent while nothing has failed", async ({ page }) => {
  await expect(page.getByTestId("fl-day-board")).toBeVisible()
  await expect(page.getByTestId("fl-failed-ops")).toHaveCount(0)
})
