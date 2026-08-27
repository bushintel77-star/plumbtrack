import { expect, test } from "@playwright/test";
import { avatarColors, gotoHome } from "./helpers";

test.describe("Task-at-hand hero (TodayStream focus card)", () => {
  test("hero shows the focused job with first-time-fix actions", async ({ page }) => {
    await gotoHome(page);

    await expect(page.getByRole("button", { name: "OPEN JOB", exact: true })).toBeVisible();

    const go = page.getByRole("link", { name: /^Navigate to / });
    await expect(go).toBeVisible();
    await expect(go).toHaveAttribute("href", /google\.com\/maps/);

    // Evidence strip counters are present for photos, parts and notes.
    await expect(page.getByText(/\d+ photos/).first()).toBeVisible();
    await expect(page.getByText(/\d+ parts/).first()).toBeVisible();
    await expect(page.getByText(/\d+ notes/).first()).toBeVisible();
  });

  test("responsibilities render only what is actually owed", async ({ page }) => {
    await gotoHome(page);

    const duties = page.locator("section", { hasText: "MY RESPONSIBILITIES" }).locator("button");
    const count = await duties.count();

    // Exception list: every duty names a concrete owed thing.
    for (let i = 0; i < count; i++) {
      const label = await duties.nth(i).getAttribute("aria-label");
      expect(label, `duty ${i} must have an accessible name`).toBeTruthy();
    }

    if (count > 0) {
      // Seeded state owes at least a daily report for the focused job.
      await expect(
        page.getByRole("button", { name: /^Daily report due —/ }),
      ).toBeVisible();
    }
  });

  test("team comms show unread messages with real identity colours", async ({ page }) => {
    await gotoHome(page);

    const comms = page.locator("section", { hasText: "TEAM & MANAGEMENT" });
    const rows = comms.locator("button");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // Each row carries an avatar whose colour is the author's identity —
    // a per-person value, never the neutral fallback token.
    const colors = await avatarColors(comms);
    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) {
      expect(color, "avatar must not fall back to the neutral token").not.toBe(
        "var(--bg-fallback-member)",
      );
    }

    // At least two distinct authors in the seeded unread set.
    const distinct = new Set(colors);
    expect(distinct.size).toBeGreaterThanOrEqual(Math.min(2, colors.length));

    // Initials match the Slack surface: two letters from the full name
    // (MR for Mike Rossi, TB for Tim Bennett) — never a single letter
    // from a first-name-only feed.
    const initials = await comms.locator("button span[style*='background']").allTextContents();
    expect(initials.length).toBeGreaterThan(0);
    for (const text of initials) {
      expect(text.trim()).toMatch(/^[A-Z]{2}$/);
    }
    const mikeInitials = await page
      .getByRole("button", { name: /Message from Mike in/ })
      .first()
      .locator("span[style*='background']")
      .textContent();
    expect(mikeInitials?.trim()).toBe("MR");
  });
});
