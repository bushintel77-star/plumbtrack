import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/?module=dispatch")
  await expect(page.getByTestId("fl-connection")).toHaveText(/Demo data/i, { timeout: 20_000 })
  await expect(page.getByTestId("matrix-view")).toBeVisible({ timeout: 20_000 })
})

/* ── Route Optimizer (reference card 1: config + apply) ─────────────────── */

test.describe("Route Optimizer card", () => {
  test("optimizes today's unassigned queue into travel-ordered routes and applies atomically", async ({
    page
  }) => {
    await page.getByTestId("optimizer-trigger").click()
    await expect(page.getByTestId("route-optimizer")).toBeVisible()
    await expect(page.getByTestId("opt-scope-unassigned")).toHaveAttribute(
      "aria-selected",
      "true"
    )

    await page.getByTestId("opt-run").click()
    await expect(page.getByTestId("opt-results")).toBeVisible()

    // Dana is the emptiest qualified van (Priya on leave) — the emergency
    // drainage task routes to her first, then nearest-neighbour order.
    const dana = page.getByTestId("route-card-t-dana")
    await expect(dana).toBeVisible()
    await expect(page.getByTestId("route-stop-t-dana-j-1001")).toBeVisible()
    await expect(page.getByTestId("route-stop-t-dana-j-1008")).toBeVisible()
    await expect(page.getByTestId("route-stop-t-dana-j-1007")).toBeVisible()

    // Stops appear in travel order with drive-time legs between them.
    const stops = page.locator('[data-testid^="route-stop-t-dana-"]')
    await expect
      .poll(async () => stops.evaluateAll(els => els.map(el => el.dataset.testid)))
      .toEqual([
        "route-stop-t-dana-j-1001",
        "route-stop-t-dana-j-1008",
        "route-stop-t-dana-j-1007"
      ])
    await expect(page.getByTestId("route-stop-t-dana-j-1008")).toContainText(/\d+M/)
    await expect(dana).toContainText(/~\d+M TRAVEL/)

    // Absent techs never receive a route.
    await expect(page.getByTestId("route-card-t-priya")).toHaveCount(0)

    await page.getByTestId("opt-apply").click()
    await expect(page.getByTestId("route-optimizer")).toHaveCount(0)

    // The whole day lands atomically: queue drains, blocks land on Dana's
    // row, and the canvas travel bands carry real inter-stop gaps.
    await expect(page.getByTestId("queue-card-j-1001")).toHaveCount(0)
    await expect(page.getByTestId("queue-card-j-1007")).toHaveCount(0)
    await expect(page.getByTestId("queue-card-j-1008")).toHaveCount(0)
    await expect(
      page.locator('[data-testid="tech-row-t-dana"] [data-testid="job-block-j-1001"]')
    ).toBeVisible()
    await expect(page.getByTestId("travel-segment-j-1001-j-1008")).toBeVisible()
  })

  test("max tasks per route spills overflow onto the next lightest van", async ({
    page
  }) => {
    await page.getByTestId("optimizer-trigger").click()
    // 8 → 2 tasks per route.
    for (let i = 0; i < 6; i++) {
      await page.getByTestId("opt-max-tasks-dec").click()
    }
    await expect(page.getByTestId("opt-max-tasks")).toHaveText(/^02/)

    await page.getByTestId("opt-run").click()
    await expect(page.getByTestId("route-card-t-dana")).toBeVisible()
    await expect(
      page.locator('[data-testid^="route-stop-t-dana-"]')
    ).toHaveCount(2)
    // Carlos is the next-lightest available van — overflow lands after his
    // existing rough-in.
    await expect(page.getByTestId("route-stop-t-carlos-j-1007")).toBeVisible()
  })
})

/* ── Availability panel (reference card 2) ──────────────────────────────── */

test.describe("Availability panel", () => {
  test("surfaces crew bandwidth and quick-assigns the selected task", async ({
    page
  }) => {
    await expect(page.getByTestId("availability-counts")).toHaveText("3F·0B·1L")

    await page.getByTestId("availability-trigger").click()
    await expect(page.getByTestId("availability-panel")).toBeVisible()
    await expect(page.getByTestId("availability-row-t-priya")).toContainText(/LEAVE/)
    await expect(page.getByTestId("availability-row-t-dana")).toContainText(/FREE FROM 8:00/)

    // Select an unassigned task, then the panel becomes a quick-assign
    // surface: qualified + free rows carry ASSIGN, others are gated.
    await page.keyboard.press("Escape")
    await page.getByTestId("queue-card-j-1001").click()
    await page.getByTestId("details-close").click()

    await page.getByTestId("availability-trigger").click()
    await expect(page.getByTestId("availability-assign-t-dana")).toBeEnabled()
    await expect(page.getByTestId("availability-assign-t-carlos")).toBeDisabled()
    await expect(page.getByTestId("availability-assign-t-priya")).toBeDisabled()

    await page.getByTestId("availability-assign-t-dana").click()
    await expect(page.getByTestId("queue-card-j-1001")).toHaveCount(0)
    await expect(
      page.locator('[data-testid="tech-row-t-dana"] [data-testid="job-block-j-1001"]')
    ).toBeVisible()
  })
})

/* ── Suggestion strip drive-time ranking (reference card 3) ─────────────── */

test.describe("Suggestion ranking with drive time", () => {
  test("drive-time chips rank crews and the criteria footer states the ordering", async ({
    page
  }) => {
    await page.getByTestId("queue-card-j-1001").click()
    await page.getByTestId("details-close").click()

    await expect(page.getByTestId("suggestion-strip")).toBeVisible()
    await expect(page.getByTestId("suggestion-item-t-dana")).toContainText("QUALIFIED")
    await expect(page.getByTestId("suggestion-drive-t-dana")).toHaveText(/~\d+M DRIVE/)
    // Skill mismatches are named as such on the ranking chips.
    await expect(page.getByTestId("suggestion-item-t-carlos")).toContainText("NO SKILL")
    await expect(page.getByTestId("suggestion-criteria")).toContainText(
      "DRIVE · SKILL · AVAILABILITY · LOAD"
    )
  })
})

/* ── Slack FSM bridge (research §Slack integration) ─────────────────────── */

test.describe("Slack FSM bridge", () => {
  test("FSM transitions fan out to dispatch cards; accept claims; channels spin up and archive", async ({
    page
  }) => {
    // Bootstrap: today's unassigned queue already has alert cards.
    await page.getByTestId("comms-trigger").click()
    await expect(page.getByTestId("comms-panel")).toBeVisible()
    await expect(page.getByTestId("slack-card-j-1001")).toBeVisible()
    await expect(page.getByTestId("slack-card-j-1007")).toBeVisible()
    await expect(page.getByTestId("slack-card-j-1008")).toBeVisible()

    // Interactive Accept → best-ranked crew claims; the card rewrites.
    await page.getByTestId("slack-accept-j-1001").click()
    await expect(page.getByTestId("slack-claimed-j-1001")).toHaveText(
      /CLAIMED BY DANA/
    )
    await expect(page.getByTestId("queue-card-j-1001")).toHaveCount(0)

    // Slash command from the field: en-route attaches the live ETA.
    await page.getByTestId("comms-input").fill("/dispatch-status j-1001 en_route")
    await page.getByTestId("comms-input").press("Enter")
    await expect(page.getByTestId("slack-eta-j-1001")).toHaveText(/ETA ~\d+M/)

    // On-site spins up the temporary incident channel.
    await page.getByTestId("comms-input").fill("/dispatch-status j-1001 active")
    await page.getByTestId("comms-input").press("Enter")
    await page.getByTestId("comms-tab-messages").click()
    await expect(page.getByTestId("comms-channel-job-j-1001")).toBeVisible()
    await expect(page.getByTestId("comms-channel-job-j-1001")).not.toContainText(
      "ARCHIVED"
    )

    // Completion archives the channel and closes the card lifecycle.
    await page.getByTestId("comms-tab-cards").click()
    await page.getByTestId("comms-input").fill("/dispatch-status j-1001 complete")
    await page.getByTestId("comms-input").press("Enter")
    await expect(page.getByTestId("slack-card-j-1001")).toContainText(
      "CHANNEL ARCHIVED"
    )
    await page.getByTestId("comms-tab-messages").click()
    await expect(page.getByTestId("comms-channel-job-j-1001")).toContainText(
      "ARCHIVED"
    )

    await page.getByTestId("comms-close").click()
    await expect(page.getByTestId("comms-panel")).toHaveCount(0)
  })
})
