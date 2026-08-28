import { expect, test, type Page } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/?module=dispatch&view=map")
  await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 20_000 })
  await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 20_000 })
  // Circle features only become queryable once the style settles — under
  // software GL (headless CI) that lags the canvas element by seconds.
  await page.waitForTimeout(5000)
})

/**
 * Sweeps the WebGL canvas row by row with dense intermediate mouse events so
 * every rendered job pin gets hovered at least once. The hover popup is
 * sticky by design (it only clears when the cursor leaves the map), so the
 * first pin crossing of any row is enough to surface it.
 */
async function sweepForPin(page: Page): Promise<boolean> {
  const box = await page.locator(".maplibregl-canvas").boundingBox()
  if (!box) throw new Error("map canvas has no bounding box")

  const popup = page.locator('[data-testid^="map-popup-"]')
  for (let y = box.y + 20; y < box.y + box.height - 10; y += 40) {
    await page.mouse.move(box.x + 20, y)
    await page.mouse.move(box.x + box.width - 20, y, { steps: 80 })
    if ((await popup.count()) > 0) return true
  }
  return false
}

/** The popup is anchored bottom-first above its pin; the outer
 * .maplibregl-popup box ends at the tip, so the pin circle sits just below. */
async function pinPoint(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator(".maplibregl-popup").boundingBox()
  if (!box) throw new Error("hover popup has no bounding box")
  return { x: box.x + box.width / 2, y: box.y + box.height + 6 }
}

test.describe("Map view interactions", () => {
  test("hovering a job pin shows a sticky popup whose button opens job details", async ({ page }) => {
    expect(await sweepForPin(page)).toBe(true)

    const popup = page.locator('[data-testid^="map-popup-"]')
    await expect(popup).toBeVisible()
    await expect(popup.getByRole("button", { name: "Open job details" })).toBeVisible()

    // Sticky hover: moving across empty map (but staying on the canvas)
    // must keep the popup mounted so its action button stays reachable.
    const box = await page.locator(".maplibregl-canvas").boundingBox()
    await page.mouse.move(box!.x + box!.width - 40, box!.y + box!.height - 40, { steps: 20 })
    await expect(popup).toBeVisible()

    await popup.getByRole("button", { name: "Open job details" }).click()
    await expect(page.locator('[data-testid^="inspector-j-"]')).toBeVisible()

    // Leaving the canvas entirely dismisses the popup.
    await page.mouse.move(60, 400)
    await expect(popup).toHaveCount(0)
  })

  test("clicking a job pin opens its details inspector directly", async ({ page }) => {
    expect(await sweepForPin(page)).toBe(true)

    const { x, y } = await pinPoint(page)
    await page.mouse.click(x, y)
    await expect(page.locator('[data-testid^="inspector-j-"]')).toBeVisible()
  })
})
