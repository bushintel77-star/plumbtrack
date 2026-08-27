import { expect, test } from "@playwright/test";
import { gotoHome, openTab } from "./helpers";

test.describe("Document vault — compliance & expiry tracking", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page);
    await openTab(page, "More");
    await page.getByRole("button", { name: /^Documents/ }).click();
  });

  test("stats tiles count the vault, expiring and expired", async ({ page }) => {
    const main = page.getByRole("main");

    const totalTile = main.locator(".surface-card", { hasText: "Documents" }).first();
    const soonTile = main.locator(".surface-card", { hasText: "Expiring" }).first();
    const expiredTile = main.locator(".surface-card", { hasText: "Expired" }).first();

    const total = Number(await totalTile.locator("p.text-lg").textContent());
    const soon = Number(await soonTile.locator("p.text-lg").textContent());
    const expired = Number(await expiredTile.locator("p.text-lg").textContent());

    expect(total).toBeGreaterThan(0);
    expect(soon).toBeGreaterThanOrEqual(0);
    expect(expired).toBeGreaterThanOrEqual(0);
    expect(soon + expired).toBeLessThanOrEqual(total);
  });

  test("upload CTA and document search are present", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Upload document" })).toBeVisible();
    await expect(page.getByLabel("Search documents")).toBeVisible();
  });

  test("category and scope filters cover the compliance taxonomy", async ({ page }) => {
    for (const scope of ["All", "Company", "Jobs"]) {
      await expect(
        page.getByRole("button", { name: scope, exact: true }).first(),
      ).toBeVisible();
    }
    // Compliance, warranty, permit and insurance categories all exist.
    for (const cat of [/Compliance/i, /Warranty/i, /Permit/i, /Insurance/i]) {
      await expect(page.getByRole("button", { name: cat }).first()).toBeVisible();
    }
  });

  test("documents needing attention are surfaced on the home duty list", async ({ page }) => {
    const main = page.getByRole("main");
    const soon = Number(
      await main.locator(".surface-card", { hasText: "Expiring" }).first().locator("p.text-lg").textContent(),
    );
    const expired = Number(
      await main.locator(".surface-card", { hasText: "Expired" }).first().locator("p.text-lg").textContent(),
    );
    const atRisk = soon + expired;

    // The home responsibilities must agree: N compliance documents need attention.
    await openTab(page, "Jobs");
    if (atRisk > 0) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${atRisk} compliance documents? need`) }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("button", { name: /compliance documents? need attention/ }),
      ).toHaveCount(0);
    }
  });
});
