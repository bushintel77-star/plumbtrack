import { expect, test } from "@playwright/test"

test.describe("HQ session and accessibility safeguards", () => {
  test("exposes a session control with an accessible action label", async ({ page }) => {
    await page.goto("/?module=dispatch")
    const session = page.getByTestId("session-badge")
    await expect(session).toBeVisible()
    await expect(session).toHaveAttribute("aria-label", /session|sign out/i)
  })

  test("map crew selector is keyboard reachable and exposes crew options", async ({ page }) => {
    await page.goto("/?module=dispatch&view=map")
    const select = page.getByTestId("map-van-select")
    await expect(select).toBeVisible()
    await select.focus()
    await expect(select).toBeFocused()
    await select.selectOption({ index: 1 })
    await expect(page.getByTestId("map-eta")).toBeVisible()
  })
})
