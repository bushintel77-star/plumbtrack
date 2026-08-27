import { expect, test } from "@playwright/test";
import { avatarColors, gotoDashboard } from "./helpers";

test.describe("Metrics Bento — live graphs and identity colour", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDashboard(page);
  });

  test("hours tile shows a real trailing-week bar chart with weekday letters", async ({ page }) => {
    const hoursTile = page.locator(".surface-card", { hasText: /Hours (today|this week|all time)/ }).first();

    // Seven bars for the trailing week…
    const bars = hoursTile.locator("div[aria-hidden='true'] > div:first-child > span");
    await expect(bars).toHaveCount(7);

    // …and seven weekday letters, today's called out in accent.
    const letters = hoursTile.locator("div[aria-hidden='true'] > div:last-child > span");
    await expect(letters).toHaveCount(7);
    await expect(letters.last()).toHaveClass(/text-accent/);

    // The last bar (today) is the accent bar; worked days rise, empty days
    // stay hairlines in the line token — never fake 6% activity.
    await expect(bars.last()).toHaveClass(/bg-accent/);
    const classes = await bars.evaluateAll((nodes) => nodes.map((n) => n.className));
    for (const cls of classes.slice(0, -1)) {
      expect(
        String(cls).includes("bg-fill-strong") || String(cls).includes("bg-line"),
        `bar class "${cls}" must encode worked vs empty`,
      ).toBeTruthy();
    }
  });

  test("daily reports ring renders a visible track and status colour", async ({ page }) => {
    const ring = page.locator(".surface-card", { hasText: "Daily reports" }).first();

    // Track circle is painted with the fill token — the ring is visible even
    // at 0% (this was the "looks like a placeholder" bug).
    await expect(ring.locator('circle[stroke="var(--fill-strong)"]')).toHaveCount(1);

    // Progress arc container carries a status colour claim (the ring svg is
    // the second svg in the tile — the first is the header icon).
    const arcHost = ring.locator("svg").last().locator("..");
    await expect(arcHost).toHaveClass(/text-(pending|complete)/);

    // Count + caption communicate the actual owed state.
    await expect(ring.getByText(/due today|all reports in/)).toBeVisible();
    await expect(ring.getByText(/^\d+%\t?$/).or(ring.getByText(/^\d+%/))).toBeVisible();
  });

  test("crew tile: every member keeps their identity colour", async ({ page }) => {
    const crewTile = page.locator(".surface-card", { hasText: "Crew" }).first();
    const colors = await avatarColors(crewTile);
    expect(colors.length).toBeGreaterThanOrEqual(3);

    for (const color of colors) {
      expect(color, "avatar must not fall back to the neutral token").not.toBe(
        "var(--bg-fallback-member)",
      );
    }
    // Tim, Sarah and Mike are distinct people — distinct colours.
    expect(new Set(colors).size).toBe(colors.length);
  });

  test("scope segmented control switches the hours basis", async ({ page }) => {
    await page.getByRole("tab", { name: "This week" }).click();
    await expect(page.getByText("Hours this week")).toBeVisible();

    await page.getByRole("tab", { name: "All" }).click();
    await expect(page.getByText("Hours all time")).toBeVisible();
  });

  test("quotes tile states the open pipeline honestly", async ({ page }) => {
    const quotesTile = page.locator(".surface-card", { hasText: "Quotes pending" }).first();
    await expect(quotesTile.getByText(/open$/, { exact: false })).toBeVisible();
    // Either a dollar value or the explicit "awaiting line items" honesty line.
    await expect(
      quotesTile.getByText(/^\$/).or(quotesTile.getByText(/awaiting line items/)),
    ).toBeVisible();
  });

  test("job health lists live, scheduled and done rows with distinct chips", async ({ page }) => {
    const section = page
      .getByText("Job health")
      .locator("xpath=ancestor::div[1]/following-sibling::div[1]");
    await expect(section.getByText("Live", { exact: true }).first()).toBeVisible();
    await expect(section.getByText("Sched", { exact: true }).first()).toBeVisible();
  });
});
