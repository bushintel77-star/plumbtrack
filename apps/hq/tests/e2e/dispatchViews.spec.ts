import { expect, test } from "@playwright/test"

test.describe("Dispatch presentation views (Kibo table/list/Gantt)", () => {
  test("table view renders the status contract with focusable rows", async ({ page }) => {
    await page.goto("/?module=dispatch&view=list&presentation=table")
    const table = page.getByTestId("kibu-table-view")
    await expect(table).toBeVisible({ timeout: 20_000 })
    // Every body row is keyboard-focusable (Kibo row model).
    const row = table.locator("tbody tr").first()
    await expect(row).toBeVisible()
    await row.focus()
    await expect(row).toBeFocused()
    await row.press("Enter")
    await expect(page.locator('[data-testid^="inspector-j-"]')).toBeVisible()
  })

  test("gantt view renders lanes with the now-line inside the board day", async ({ page }) => {
    // The now-line only exists between 08:00–18:00 local; pin the page clock
    // to mid-day so the test holds in every timezone.
    const noon = new Date()
    noon.setHours(12, 0, 0, 0)
    await page.clock.setFixedTime(noon)
    await page.goto("/?module=dispatch&view=list&presentation=gantt")
    const gantt = page.getByTestId("kibu-gantt-view")
    await expect(gantt).toBeVisible({ timeout: 20_000 })
    await expect(gantt.getByTestId("gantt-now-line").first()).toBeVisible()
  })

  test("list view renders job cards", async ({ page }) => {
    await page.goto("/?module=dispatch&view=list")
    await expect(page.getByTestId("kibu-list-view")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("kibu-list-view").locator("button.panel").first()).toBeVisible()
  })
})

test.describe("Shift pulse and drag-state channel", () => {
  test("health strip filters the board to unassigned work", async ({ page }) => {
    await page.goto("/?module=dispatch&view=list")
    const strip = page.getByRole("button", { name: /Needs dispatch:/ })
    await expect(strip).toBeVisible({ timeout: 20_000 })
    await strip.click()
    // The board list narrows to unassigned jobs and the status filter lands in the URL.
    await expect(page).toHaveURL(/status=unassigned/)
  })

  test("board exposes the drag FSM state channel (idle at rest)", async ({ page }) => {
    await page.goto("/?module=dispatch")
    await expect(page.getByTestId("kibu-list-view").or(page.locator("[data-drag-state]"))).toBeVisible({ timeout: 20_000 })
    const board = page.locator("[data-drag-state]")
    await expect(board).toHaveCount(1)
    await expect(board).toHaveAttribute("data-drag-state", "idle")
  })
})

test.describe("Crew route job tree (matrix view)", () => {
  test("expand a crew route and open a job from the tree", async ({ page }) => {
    await page.goto("/?module=dispatch&view=matrix")
    const tree = page.getByTestId("crew-route-job-tree")
    await expect(tree).toBeVisible({ timeout: 20_000 })

    await tree.getByRole("button", { name: /· \d+ jobs/ }).first().click()
    const routeToggle = tree.getByRole("button", { name: /Route ·/ }).first()
    await expect(routeToggle).toBeVisible()
    await routeToggle.click()

    const jobButton = tree.locator('[data-testid^="tree-job-"]').first()
    await expect(jobButton).toBeVisible()
    await jobButton.click()
    await expect(page.locator('[data-testid^="inspector-j-"]')).toBeVisible()
  })
})
