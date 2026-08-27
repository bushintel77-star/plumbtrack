import { expect, test } from "@playwright/test";
import { gotoHome, logOn } from "./helpers";

test.describe("Shift log-on lifecycle", () => {
  test("notice checkbox gates the log-on button", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: /^LOG ON/ }).click();

    await expect(page.getByText("Log on to your shift")).toBeVisible();
    await expect(page.getByRole("button", { name: /Standard shift/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Recall \(call-back\)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Inclement weather/ })).toBeVisible();

    const submit = page.getByRole("button", { name: "Log On & Start Shift" });
    await expect(submit).toBeDisabled();
    await page
      .getByRole("checkbox", { name: "Acknowledge workplace tracking notice" })
      .check();
    await expect(submit).toBeEnabled();
  });

  test("log-on starts the shift at zero elapsed with GPS notice", async ({ page }) => {
    await gotoHome(page);
    await logOn(page);

    await expect(page.getByText("GPS ACTIVE")).toBeVisible();

    // Hero counters start from zero — no carryover from a previous session.
    const heroValues = page.locator(".data-hero");
    await expect(heroValues.first()).toHaveText(/^00/);
    await expect(heroValues.nth(1)).toHaveText(/^00/);
  });

  test("meal break pauses tracking and can end", async ({ page }) => {
    await gotoHome(page);
    await logOn(page);

    await page.getByRole("button", { name: /BREAK/ }).click();
    await expect(page.getByText("On Break")).toBeVisible();
    await expect(page.getByText(/UNPAID BREAK · \d+m/)).toBeVisible();

    await page.getByRole("button", { name: /END BREAK/ }).click();
    await expect(page.getByText("Active Route")).toBeVisible();
  });

  test("log-off sheet confirms before clearing the shift", async ({ page }) => {
    await gotoHome(page);
    await logOn(page);

    await page.getByRole("button", { name: /LOG OFF/ }).click();
    await expect(
      page.getByRole("button", { name: /Log Off & Stop Tracking/ }),
    ).toBeVisible();
  });
});
