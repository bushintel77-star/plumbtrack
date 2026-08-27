import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Shared helpers for the PlumbTrack E2E suite.
 *
 * Every test starts from a fresh browser context (Playwright default), which
 * means a clean localStorage and the seeded demo state — the same first-run
 * conditions a new device sees.
 */

export async function gotoHome(page: Page) {
  await page.goto("/");
  const heading = page.getByText("Today's Jobs");
  const nav = page.getByRole("navigation", { name: "Primary" });

  // Self-healing boot: the dev server occasionally serves a dud shell under
  // rapid context churn (page renders, then blanks before hydration lands).
  // One reload restores it — cheaper and more honest than a flaky red suite.
  await expect(heading).toBeVisible({ timeout: 15_000 });
  if (!(await nav.isVisible().catch(() => false))) {
    await page.reload();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  }
  await expect(nav).toBeVisible({ timeout: 15_000 });
}

/** Bottom navigation targets (scoped — view chips can share names). */
export async function openTab(page: Page, label: string) {
  const target = () =>
    page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("button", { name: label, exact: true });

  try {
    await target().click({ timeout: 8_000 });
  } catch {
    // Self-heal a dud shell: reload to a clean mount and retry once.
    await page.reload();
    await expect(page.getByText("Today's Jobs")).toBeVisible({ timeout: 15_000 });
    await target().click({ timeout: 10_000 });
  }
}

/** More sheet -> Dashboard (the Metrics Bento). */
export async function gotoDashboard(page: Page) {
  await gotoHome(page);
  await openTab(page, "More");
  await page.getByRole("button", { name: /^Dashboard/ }).click();
  await expect(page.getByText("Job health")).toBeVisible();
}

/** Complete the shift log-on flow and return to the home stream. */
export async function logOn(page: Page) {
  await page.getByRole("button", { name: /^LOG ON/ }).click();
  const sheet = page.getByText("Log on to your shift");
  await expect(sheet).toBeVisible();

  const submit = page.getByRole("button", { name: "Log On & Start Shift" });
  await expect(submit).toBeDisabled();

  await page
    .getByRole("checkbox", { name: "Acknowledge workplace tracking notice" })
    .check();
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByText("Active Route")).toBeVisible();
}

/**
 * Read the declared identity colour of avatar spans under a locator.
 * Pure attribute reads — no page-function evaluation, which measurably
 * interferes with subsequent sheet interactions in this stack.
 * Values come back as-authored: "rgb(...)", "#hex", or a var() fallback.
 */
export async function avatarColors(scope: Locator): Promise<string[]> {
  const spans = scope.locator("span[style*='background']");
  const n = await spans.count();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const style = (await spans.nth(i).getAttribute("style")) ?? "";
    const m = style.match(/background(?:-color)?:\s*([^;]+)/i);
    if (m) out.push(m[1].trim());
  }
  return out;
}
