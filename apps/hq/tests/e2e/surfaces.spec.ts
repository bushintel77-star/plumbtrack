import { test, expect } from "@playwright/test"

/**
 * The non-dispatch surfaces: documents register, CRM, reports and the Slack
 * integration's honest disconnected state. In the deterministic tier there
 * is no API, so live-data surfaces render their empty/error/CTA states —
 * which is exactly what these specs pin: never fabricated content.
 */

test("documents register renders its categories and an honest data state", async ({ page }) => {
  await page.goto("/?surface=documents")
  await expect(page.getByRole("complementary", { name: "Document categories" })).toBeVisible()
  await expect(page.getByRole("complementary", { name: "Expiring and expired" })).toBeVisible()
  // Without an API the register says what it is doing — loading, empty, or
  // failed — never invented documents.
  await expect(page.getByText(/loading live documents|no documents in this category|couldn't load/i)).toBeVisible()
})

test("CRM renders the customer tree with a working filter", async ({ page }) => {
  await page.goto("/?surface=crm")
  await expect(page.getByRole("complementary", { name: "Customers" })).toBeVisible()
  const filter = page.getByRole("textbox", { name: "Filter customers" })
  await expect(filter).toBeVisible()
  await filter.fill("northgate")
  // No API in this tier: the list is honestly empty, and the filter still
  // accepts input for the live tier.
  await expect(page.getByRole("complementary", { name: "Agreements due soon" })).toBeVisible()
})

test("reports surface renders with its payments panel", async ({ page }) => {
  await page.goto("/?surface=reports")
  await expect(page.locator(".fl-section")).toHaveText("Reports")
  await expect(page.getByRole("complementary", { name: "Payments" })).toBeVisible()
})

test("Slack surface shows the honest disconnected state", async ({ page }) => {
  await page.goto("/?surface=slack")
  const surface = page.getByTestId("slack-surface")
  await expect(surface).toBeVisible()
  // No workspace is connected in this tier: the channels pane says so…
  await expect(page.getByRole("complementary", { name: "Slack channels" })).toContainText(
    /not connected yet/i
  )
  // …the main pane names its condition outright rather than faking a feed…
  await expect(page.getByText(/not connected — nothing in this surface is live yet/i)).toBeVisible()
  // …and the connect CTA is the state.
  await expect(page.getByTestId("slack-connect")).toBeVisible()
})

test("map surface mounts with its keyboard-accessible chrome", async ({ page }) => {
  await page.goto("/?surface=map")
  await expect(
    page.getByRole("region", { name: /job map\. pins are focusable buttons/i })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Previous day" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Next day" })).toBeVisible()
})
