import { expect, test, type Page } from "@playwright/test"
import { expectWithSelfHeal, storeAction } from "../helpers/selfHeal"

test.beforeEach(async ({ page }) => {
  await page.goto("/?module=dispatch")
  // Deterministic demo mode (NEXT_PUBLIC_HQ_FORCE_DEMO=1 at build time).
  // Generous timeout: the first test of a cold server compiles route chunks.
  await expect(page.getByTestId("demo-badge")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId("matrix-view")).toBeVisible({ timeout: 20_000 })
})

/* eslint-disable @typescript-eslint/no-explicit-any */

test.describe("App shell (Arrivy topology)", () => {
  test("dashboard is the landing module and navigates to dispatch via the sidebar", async ({
    page
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("dashboard-view")).toBeVisible()
    await expect(page.getByTestId("stat-today")).toBeVisible()
    await expect(page.getByTestId("stat-queue")).toBeVisible()
    await expect(page.getByTestId("stat-active")).toBeVisible()
    await expect(page.getByTestId("stat-alerts")).toBeVisible()

    await page.getByTestId("nav-dispatch").click()
    await expect(page.getByTestId("matrix-view")).toBeVisible()
    await expect(page).toHaveURL(/module=dispatch/)

    // View tabs toggle the single canvas (researched topology).
    await page.getByTestId("view-calendar").click()
    await expect(page.getByTestId("calendar-view")).toBeVisible()
    await page.getByTestId("view-map").click()
    await expect(page.getByTestId("map-view")).toBeVisible()
    // WebGL engine mounts (GeoJSON pins replace the old SVG testids).
    await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 20_000 })
    await page.getByTestId("view-matrix").click()
    await expect(page.getByTestId("matrix-view")).toBeVisible()
  })

  test("colourway toggle flips between hardware chassis and Soft White", async ({ page }) => {
    await page.goto("/?module=dispatch")
    // Hardware chassis (dark) is the default colourway.
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.getByTestId("theme-toggle").click()
    await expect(page.locator("html")).not.toHaveClass(/dark/)
    await expect(page.getByTestId("matrix-view")).toBeVisible()
    await page.getByTestId("theme-toggle").click()
    await expect(page.locator("html")).toHaveClass(/dark/)
  })
})

test.describe("Single-Active-State Enforcer + timer lifecycle", () => {
  test("fresh clock-on renders 00:00:00 and enforces exactly one pulsing timer per row", async ({
    page
  }) => {
    await page.getByTestId("job-block-j-1002").click()
    await expect(page.getByTestId("inspector-j-1002")).toBeVisible()
    await page.getByTestId("clock-on-btn").click()

    await expect(page.getByTestId("timer-j-1002")).toHaveText(/^00:00:0/)
    await expect(
      page.locator('[data-testid="tech-row-t-mike"] [data-testid^="timer-"]')
    ).toHaveCount(1)

    await page.getByTestId("details-close").click()
    await page.waitForTimeout(2100)

    await page.getByTestId("job-block-j-1003").click()
    await page.getByTestId("clock-on-btn").click()

    await expect(page.getByTestId("timer-j-1003")).toHaveText(/^00:00:0/)
    await expect(page.getByTestId("job-block-j-1002")).toContainText("QUEUED")
    await expect(page.getByTestId("job-block-j-1002")).toHaveAttribute(
      "data-status",
      "scheduled"
    )
    await expect(
      page.locator('[data-testid="tech-row-t-mike"] [data-testid^="timer-"]')
    ).toHaveCount(1)

    // Clock-off is gated behind the shift wrap-up evidence flow (meal break +
    // safety handoff) — confirm both to close the timer.
    await page.getByTestId("clock-off-btn").click()
    await page.getByText("Meal break recorded").click()
    await page.getByText("Safety and site handoff complete").click()
    await page.getByTestId("confirm-clock-off").click()
    await expect(page.getByTestId("job-block-j-1003")).toHaveAttribute(
      "data-status",
      "complete"
    )
    await expect(page.getByTestId("job-block-j-1003")).toContainText("DONE")
    await expect(
      page.locator('[data-testid="tech-row-t-mike"] [data-testid^="timer-"]')
    ).toHaveCount(0)
  })
})

test.describe("Constraint-aware drag-and-drop (BR-04)", () => {
  test("valid drop assigns; skill-mismatched target is visibly blocked and refuses the drop", async ({
    page
  }) => {
    await dragCardToRow(page, "queue-card-j-1007", "tech-row-t-carlos", { hoverOnly: true })
    const carlosSlots = page.locator(
      '[data-testid="row-body-t-carlos"] [data-testid^="slot-"]'
    )
    await expect.poll(async () => carlosSlots.count()).toBe(20)
    await expect
      .poll(async () =>
        carlosSlots.evaluateAll(
          els => els.filter(e => (e as HTMLElement).dataset.valid === "true").length
        )
      )
      .toBeGreaterThan(0)
    await expect
      .poll(async () =>
        carlosSlots.evaluateAll(
          els => els.filter(e => (e as HTMLElement).dataset.valid === "false").length
        )
      )
      .toBeGreaterThan(0)
    await page.mouse.up()

    await expect(page.getByTestId("job-block-j-1007")).toBeVisible()
    await expect(page.getByTestId("queue-card-j-1007")).toHaveCount(0)

    await dragCardToRow(page, "queue-card-j-1001", "tech-row-t-mike", { hoverOnly: true })
    await expect(page.getByTestId("row-blocked-t-mike")).toBeVisible()
    await page.mouse.up()

    await expect(page.getByText("Assignment blocked")).toBeVisible()
    await expect(page.getByTestId("queue-card-j-1001")).toHaveCount(1)
    await expect(page.getByTestId("job-block-j-1001")).toHaveCount(0)
  })

  test("approved leave is a hashed, un-droppable zone — drags are physically rejected", async ({
    page
  }) => {
    // Priya is on approved leave today.
    await expect(page.getByTestId("absence-row-t-priya")).toBeVisible()

    await dragCardToRow(page, "queue-card-j-1008", "tech-row-t-priya", { hoverOnly: true })
    await expect(page.getByTestId("row-blocked-t-priya")).toBeVisible()
    await page.mouse.up()

    await expect(page.getByText(/approved leave/)).toBeVisible()
    await expect(page.getByTestId("queue-card-j-1008")).toHaveCount(1)
    await expect(page.getByTestId("job-block-j-1008")).toHaveCount(0)
  })
})

test.describe("Assignment, rollback and clock-on unlock", () => {
  test("assignment via details overlay unlocks clock-on and drains the queue card", async ({ page }) => {
    await page.getByTestId("queue-card-j-1008").click()
    await expect(page.getByTestId("inspector-j-1008")).toBeVisible()
    await expect(page.getByTestId("clock-on-btn")).toBeDisabled()

    await page.getByTestId("tech-select").selectOption("t-dana")
    await expect(page.getByTestId("queue-card-j-1008")).toHaveCount(0)

    await page.getByTestId("clock-on-btn").click()
    await expect(page.getByTestId("timer-j-1008")).toHaveText(/^00:00:0/)
    await page.getByTestId("clock-off-btn").click()
  })

  test("BR-07: a failing server persist rolls the board back to its previous state", async ({
    page
  }) => {
    await page.evaluate(() => {
      ;(window as any).__hqStore.getState().setSimulateFailure(true)
    })
    await page.getByTestId("queue-card-j-1001").click()
    await page.getByTestId("tech-select").selectOption("t-priya")

    await expect(page.getByText(/Assignment rolled back|blocked/).first()).toBeVisible()
    await expect(page.getByTestId("queue-card-j-1001")).toHaveCount(1)
    await expect(page.getByTestId("job-block-j-1001")).toHaveCount(0)

    await page.evaluate(() => {
      ;(window as any).__hqStore.getState().setSimulateFailure(false)
    })
  })

  test("SAL-style suggestions rank crews and light the best slot on the canvas", async ({ page }) => {
    await page.getByTestId("queue-card-j-1001").click()
    await expect(page.getByTestId("inspector-j-1001")).toBeVisible()
    await page.getByTestId("details-close").click()

    await expect(page.getByTestId("suggestion-strip")).toBeVisible()
    await expect(page.locator('[data-testid^="suggestion-item-"]')).toHaveCount(3)
    await expect(page.getByTestId("suggestion-item-t-dana")).toContainText("QUALIFIED")
    // Quick-assign beacon: the optimal row + slot highlights on the canvas.
    await expect(page.getByTestId("best-slot")).toBeVisible()

    await page.locator('[data-testid^="suggestion-assign-"]').first().click()
    await expect(page.getByTestId("queue-card-j-1001")).toHaveCount(0)
    await expect(page.getByTestId("job-block-j-1001")).toHaveCount(1)
  })
})

test.describe("Spatial routing buffers (travel-time integration)", () => {
  test("travel bands render between consecutive jobs with estimated drive time", async ({
    page
  }) => {
    // Mike's seeded jobs are back-to-back (no gap → no band by design), so
    // give the second job a one-hour buffer via the test bridge.
    await page.evaluate(() => {
      const store = (window as any).__hqStore
      const state = store.getState()
      store.setState({
        jobs: {
          ...state.jobs,
          "j-1003": { ...state.jobs["j-1003"], startBlock: 12 }
        }
      })
    })

    const band = page.getByTestId("travel-segment-j-1002-j-1003")
    await expect(band).toBeVisible()
    await expect(band).toHaveAttribute("data-tight", "false")
    await expect(band).toContainText(/M$/)
  })
})

test.describe("Rapid status overrides + conflict flagging", () => {
  test("right-click on a block overrides status in place without the drill-down", async ({
    page
  }) => {
    await page.getByTestId("job-block-j-1002").click({ button: "right" })
    await page.getByRole("menuitemradio", { name: "EN ROUTE" }).click()

    await expect(page.getByTestId("job-block-j-1002")).toHaveAttribute(
      "data-status",
      "en_route"
    )
    await expect(page.getByTestId("job-block-j-1002")).toContainText("EN ROUTE")

    // Restore for downstream tests.
    await page.evaluate(() => {
      ;(window as any).__hqStore.getState().setJobStatus("j-1002", "scheduled")
    })
  })

  test("conflict detection flags overlaps with a pulsing ring and hash overlay", async ({
    page
  }) => {
    // Sabotage: overlap j-1003 (blocks 10–14) onto Mike's morning job (1–4).
    await page.evaluate(() => {
      const store = (window as any).__hqStore
      const state = store.getState()
      store.setState({
        jobs: { ...state.jobs, "j-1003": { ...state.jobs["j-1003"], startBlock: 2 } }
      })
    })

    await expect(page.getByTestId("job-block-j-1003")).toHaveAttribute(
      "data-conflict",
      "true"
    )

    // Heal for downstream tests.
    await page.evaluate(() => {
      const store = (window as any).__hqStore
      const state = store.getState()
      store.setState({
        jobs: { ...state.jobs, "j-1003": { ...state.jobs["j-1003"], startBlock: 10 } }
      })
    })
    await expect(page.getByTestId("job-block-j-1003")).toHaveAttribute(
      "data-conflict",
      "false"
    )
  })
})

test.describe("Command palette smoke", () => {
  test("Ctrl+K palette navigates to a job and opens its details overlay", async ({ page }) => {
    await page.keyboard.press("Control+K")
    await page.getByTestId("palette-input").fill("drainage")
    await page.getByRole("option", { name: /Emergency Drainage/ }).click()
    await expect(page.getByTestId("inspector-j-1001")).toBeVisible()
  })
})

test.describe("Global filter popover (noise reduction + URL state)", () => {
  test("status filter isolates the board, mirrors the URL, and restores on direct navigation", async ({
    page
  }) => {
    await page.getByTestId("filter-trigger").click()
    await page.getByTestId("chk-status-unassigned").click()

    await expect(page).toHaveURL(/status=unassigned/)
    await expect(page.getByTestId("job-block-j-1002")).toHaveCount(0)
    await expect(page.getByTestId("queue-card-j-1001")).toHaveCount(1)

    await page.goto("/?module=dispatch&status=scheduled")
    await expect(page.getByTestId("job-block-j-1002")).toBeVisible()
    // The queue is intentionally filter-independent: unassigned cards stay
    // draggable regardless of the board's status filter.
    await expect(page.getByTestId("queue-card-j-1001")).toHaveCount(1)

    await page.getByTestId("filter-clear").click()
    await expect(page.getByTestId("job-block-j-1002")).toBeVisible()
  })

  test("region filter isolates the board and clears in one click", async ({ page }) => {
    await page.getByTestId("filter-trigger").click()
    await page.getByRole("button", { name: "REGION" }).click()
    await page.getByTestId("chk-region-north").click()

    await expect(page).toHaveURL(/region=north/)
    await expect(page.getByTestId("job-block-j-1002")).toHaveCount(0) // inner
    await expect(page.getByTestId("job-block-j-1005")).toBeVisible() // north
    await expect(page.getByTestId("filter-clear")).toBeVisible()

    await page.getByTestId("filter-clear").click()
    await expect(page).not.toHaveURL(/region=/)
    await expect(page.getByTestId("job-block-j-1002")).toBeVisible()
  })

  test("team filter declutters the technician axis itself", async ({ page }) => {
    await page.getByTestId("filter-trigger").click()
    await page.getByRole("button", { name: "TEAM / ROLE" }).click()
    await page.getByTestId("chk-team-Electrician").click()

    await expect(page.getByTestId("tech-row-t-mike")).toHaveCount(0)
    await expect(page.getByTestId("tech-row-t-dana")).toBeVisible()
    await expect(page.getByTestId("tech-row-t-carlos")).toHaveCount(0)

    await page.getByTestId("filter-clear").click()
    await expect(page.getByTestId("tech-row-t-mike")).toBeVisible()
  })

  test("availability filter hides technicians on approved leave", async ({ page }) => {
    await expect(page.getByTestId("tech-row-t-priya")).toBeVisible()

    await page.getByTestId("filter-trigger").click()
    await page.getByRole("button", { name: "AVAILABILITY" }).click()
    await page.getByTestId("chk-availableOnly-true").click()

    await expect(page.getByTestId("tech-row-t-priya")).toHaveCount(0)
    await expect(page.getByTestId("tech-row-t-mike")).toBeVisible()

    await page.getByTestId("filter-clear").click()
    await expect(page.getByTestId("tech-row-t-priya")).toBeVisible()
  })
})

test.describe("Zoom topology + view switcher", () => {
  test("weekly and monthly zoom grids render jobs and absence hashing", async ({ page }) => {
    await page.getByTestId("zoom-weekly").click()
    await expect(page.getByTestId("weekly-view")).toBeVisible()
    // Priya's leave (today → +2d) hashes her cells; the window clips at the
    // week boundary, so the in-week cell count depends on today's weekday.
    const mondayIndex = (new Date().getDay() + 6) % 7
    const expectedLeaveCells = Math.min(3, 7 - mondayIndex)
    await expect(
      page.locator('[data-testid^="zoom-cell-t-priya-"]').filter({ hasText: "ON LEAVE" })
    ).toHaveCount(expectedLeaveCells)

    await page.getByTestId("zoom-monthly").click()
    await expect(page.getByTestId("monthly-view")).toBeVisible()

    await page.getByTestId("zoom-daily").click()
    await expect(page.getByTestId("matrix-view")).toBeVisible()
  })

  test("view switcher toggles matrix and list", async ({ page }) => {
    await page.getByTestId("view-list").click()
    await expect(page.getByTestId("list-view")).toBeVisible()
    await expect(page.getByTestId("list-row-j-1002")).toBeVisible()

    await page.getByTestId("view-matrix").click()
    await expect(page.getByTestId("matrix-view")).toBeVisible()
    await expect(page.getByTestId("job-block-j-1002")).toBeVisible()
  })
})

test.describe("Offline-first + live telemetry (Phase 1/4 architecture)", () => {
  test("offline mutations keep the optimistic state and queue for background sync", async ({
    page
  }) => {
    await page.evaluate(() => {
      ;(window as any).__hqStore.getState().setOffline(true)
    })

    await page.getByTestId("queue-card-j-1007").click()
    await page.getByTestId("tech-select").selectOption("t-dana")

    // Optimistic state STANDS offline (no rollback) and the queue drains later.
    await expect(page.getByText("Saved offline")).toBeVisible()
    await expect(page.getByTestId("job-block-j-1007")).toHaveCount(1)
    await expect(page.getByTestId("queue-card-j-1007")).toHaveCount(0)

    await page.evaluate(() => {
      ;(window as any).__hqStore.getState().setOffline(false)
    })
  })

  test("throttled fleet telemetry populates liveLocations for the map", async ({ page }) => {
    await page.waitForTimeout(2500)
    const pingCount = await page.evaluate(
      () => Object.keys((window as any).__hqStore.getState().liveLocations).length
    )
    expect(pingCount).toBeGreaterThan(0)
  })
})

test.describe("Programmatic self-healing", () => {
  test("detects a stuck timer, dispatches a store reset, and re-passes the assertion", async ({
    page
  }) => {
    await openPaletteAndSelect(page, "pipe re-route")
    await page.getByTestId("clock-on-btn").click()

    await page.evaluate(() => {
      const store = (window as any).__hqStore
      const state = store.getState()
      store.setState({
        jobs: {
          ...state.jobs,
          "j-1004": { ...state.jobs["j-1004"], elapsedSeconds: 9375, timerRunning: false }
        }
      })
    })

    await expectWithSelfHeal(
      page,
      () => expect(page.getByTestId("inspector-timer-j-1004")).toHaveText(/^00:00:0/),
      async () => {
        await storeAction(page, "healTimer", "j-1004")
        await storeAction(page, "clockOn", "j-1004")
      }
    )
  })
})

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

async function openPaletteAndSelect(page: Page, query: string): Promise<void> {
  await page.keyboard.press("Control+K")
  await expect(page.getByTestId("palette-input")).toBeVisible()
  await page.getByTestId("palette-input").fill(query)
  const option = page.getByRole("option").first()
  await option.waitFor({ state: "visible", timeout: 5_000 })
  await option.click()
  await expect(page.getByTestId("palette-input")).toHaveCount(0)
}

/**
 * Pointer-drags a queue card to a technician row (dnd-kit PointerSensor).
 * With `hoverOnly`, the pointer stays down so hover-state assertions can run
 * before the caller releases.
 */
async function dragCardToRow(
  page: Page,
  cardTestId: string,
  rowTestId: string,
  options: { hoverOnly?: boolean } = {}
): Promise<void> {
  const card = page.getByTestId(cardTestId)
  const row = page.getByTestId(rowTestId)
  await card.waitFor({ state: "visible" })

  const from = await card.boundingBox()
  const to = await row.boundingBox()
  if (!from || !to) throw new Error("missing bounding box for drag")

  const startX = from.x + from.width / 2
  const startY = from.y + from.height / 2
  const targetX = to.x + Math.min(to.width * 0.55, 620)
  const targetY = to.y + to.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // Creep past the pointer-sensor activation distance…
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(
      startX + (targetX - startX) * (i / 8) * 0.25,
      startY + (targetY - startY) * (i / 8) * 0.25,
      { steps: 1 }
    )
  }
  // …then travel to the row so dragover collision detection fires.
  await page.mouse.move(targetX, targetY, { steps: 12 })

  // Re-settle on the target's CURRENT position: async surfaces (suggestion
  // strip, toasts) can shift the canvas between measurement and arrival, and
  // a stale Y lands the hover on the wrong technician's row.
  await page.waitForTimeout(250)
  const settled = await row.boundingBox()
  if (settled) {
    await page.mouse.move(
      settled.x + Math.min(settled.width * 0.55, 620),
      settled.y + settled.height / 2,
      { steps: 4 }
    )
  }
  await page.waitForTimeout(150)

  if (!options.hoverOnly) {
    await page.mouse.up()
  }
}
