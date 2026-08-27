import { expect, test } from "@playwright/test";
import { gotoHome, openTab } from "./helpers";

test.describe("Messages — channels and job deep-links @desktop", () => {
  test("inline job chips deep-link to the job without dropping session", async ({ page }) => {
    await gotoHome(page);
    await openTab(page, "Messages");

    // Seeded conversation mentions jobs as J-#### tokens.
    const chip = page.getByRole("button", { name: /^J-\d+$/ }).first();
    await chip.waitFor({ state: "visible", timeout: 10_000 });
    const chipText = await chip.textContent();

    await chip.click();

    // Landing on the job view: comms tray + serial present, session intact
    // (staff switcher still shows the operator).
    await expect(page.getByText("Comms tray")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /^Working as/ })).toBeVisible();

    // And the opened serial matches the chip that was tapped.
    await expect(page.getByText(new RegExp(chipText!)).first()).toBeVisible();
  });

  test("channel list exposes the core dispatch channels", async ({ page }) => {
    await gotoHome(page);
    await openTab(page, "Messages");

    await expect(page.getByText(/general/).first()).toBeVisible({ timeout: 10_000 });
  });
});
