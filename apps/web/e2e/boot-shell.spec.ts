import { expect, test } from "@playwright/test";
import { gotoHome } from "./helpers";

test.describe("Boot & app shell", () => {
  test("role home boots with header, shift CTA and bottom navigation", async ({ page }) => {
    await gotoHome(page);

    await expect(page.getByRole("banner").getByText("Caulfield South Plumbing")).toBeVisible();
    await expect(page.getByRole("button", { name: /^LOG ON/ })).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const label of ["Jobs", "Messages", "Quotes", "More"]) {
      await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
  });

  test("day progress line reflects seeded stops", async ({ page }) => {
    await gotoHome(page);
    await expect(page.getByText(/Day · \d+ of \d+ stops done/)).toBeVisible();
  });

  test("jobs expander opens the collapsed list tooling", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: /JOBS · \d+ ACTIVE · \d+ DONE/ }).click();
    await expect(page.getByLabel("Search jobs")).toBeVisible();
    await expect(page.getByRole("button", { name: /ALL \d+/ })).toBeVisible();
  });

  // Note: the dev service-worker regression (SW must not register in dev,
  // because cache-first on stable dev chunk URLs pins stale code) is covered
  // by the dev-only unregister logic in usePlumbTrack.tsx. This suite runs
  // against a production build where SW registration is intended, and
  // service workers are blocked at the context level for isolation.
});
