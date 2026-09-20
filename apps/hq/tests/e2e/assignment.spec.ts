import { test, expect } from "@playwright/test"

/**
 * Assignment round-trips: keyboard placement through the inspector's
 * AssignControl, drag-and-drop onto a crew lane, and the rejected-move path
 * that must land in the failed-ops ledger (chip → sync pane → retry/discard)
 * instead of vanishing with a toast.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("fl-day-board")).toBeVisible()
})

test("keyboard assignment places an unassigned job on a crew", async ({ page }) => {
  await page.getByTestId("queue-job-j-1007").click()
  const inspector = page.getByRole("complementary", { name: "Sump Pump Inspection" })
  await expect(inspector).toBeVisible()
  // Mike has blocks 0–1 free (j-1002 starts at 2) — the default start block 0 fits.
  await inspector.getByRole("combobox", { name: "Crew" }).selectOption({ label: "Mike Reyes · Van 2" })
  await inspector.getByRole("button", { name: "Place on board" }).click()
  const mikesRow = page.locator(".fl-row", { hasText: "Mike Reyes" })
  await expect(mikesRow.getByTestId("board-job-j-1007")).toBeVisible()
  // The job left the unassigned queue.
  await expect(page.getByTestId("queue-job-j-1007")).toHaveCount(0)
})

test("drag-and-drop places a queued job on a free crew lane", async ({ page }) => {
  const source = page.getByTestId("queue-job-j-1008")
  await source.scrollIntoViewIfNeeded()
  const box = await source.boundingBox()
  // Dana has no jobs today — any block in her lane is a legal target.
  const lane = page.locator(".fl-row", { hasText: "Dana Whitfield" }).locator(".fl-lane")
  const laneBox = await lane.boundingBox()
  expect(box).not.toBeNull()
  expect(laneBox).not.toBeNull()
  if (!box || !laneBox) return
  const targetX = laneBox.x + laneBox.width * (1.5 / 56)
  const targetY = laneBox.y + laneBox.height / 2
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  // Stepped movement past the pointer-sensor activation distance so dnd-kit
  // picks the drag up and pointerWithin resolves the drop cell.
  await page.mouse.move(targetX, targetY, { steps: 12 })
  await page.mouse.up()
  const danasRow = page.locator(".fl-row", { hasText: "Dana Whitfield" })
  await expect(danasRow.getByTestId("board-job-j-1008")).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId("queue-job-j-1008")).toHaveCount(0)
})

test("a rejected move lands in the failed-ops ledger, not the void", async ({ page }) => {
  // j-1001 requires the drainage skill; Mike does not have it.
  await page.getByTestId("queue-job-j-1001").click()
  const inspector = page.getByRole("complementary", { name: "Emergency Drainage" })
  await expect(inspector).toBeVisible()
  await inspector.getByRole("combobox", { name: "Crew" }).selectOption({ label: "Mike Reyes · Van 2" })
  await inspector.getByRole("button", { name: "Place on board" }).click()

  // The chip appears in the topbar and the board did NOT move the job.
  const chip = page.getByTestId("fl-failed-ops")
  await expect(chip).toBeVisible()
  await expect(chip).toContainText("1 failed")
  await expect(page.getByTestId("queue-job-j-1001")).toBeVisible()

  // Opening the chip swaps the inspector to the Connection & sync pane.
  await chip.click()
  const pane = page.getByRole("complementary", { name: "Connection & sync" })
  await expect(pane).toBeVisible()
  const op = pane.getByTestId("fl-op-j-1001")
  await expect(op).toContainText(/drainage skill/i)

  // Retry restates the failure — the ledger entry survives until discarded.
  await op.getByRole("button", { name: "Retry" }).click()
  await expect(pane.getByTestId("fl-op-j-1001")).toBeVisible()
  await expect(pane.getByTestId("fl-op-j-1001")).toContainText(/drainage skill/i)

  // Discard removes the entry and the chip goes away with it.
  await pane.getByTestId("fl-op-j-1001").getByRole("button", { name: "Discard" }).click()
  await expect(page.getByTestId("fl-failed-ops")).toHaveCount(0)
})

test("a double-booked placement is refused with the conflict named", async ({ page }) => {
  // j-1007 (no skill requirement) onto Mike's start time — choose 7:30-ish
  // inside j-1002's occupied span by picking a later option from the list.
  await page.getByTestId("queue-job-j-1007").click()
  const inspector = page.getByRole("complementary", { name: "Sump Pump Inspection" })
  const start = inspector.getByRole("combobox", { name: "Start time" })
  // Options are ordered block 0..last; block 4 sits inside j-1002 (2–9).
  await start.selectOption("4")
  await inspector.getByRole("combobox", { name: "Crew" }).selectOption({ label: "Mike Reyes · Van 2" })
  await inspector.getByRole("button", { name: "Place on board" }).click()
  await expect(page.getByTestId("fl-failed-ops")).toBeVisible()
  await page.getByTestId("fl-failed-ops").click()
  await expect(page.getByTestId("fl-op-j-1007")).toContainText(/conflicts with/i)
})
