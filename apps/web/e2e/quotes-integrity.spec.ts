import { expect, test } from "@playwright/test";
import { gotoHome, openTab } from "./helpers";

test.describe("Quotes list — state data integrity", () => {
  test("every quote card shows a serial, a known status and a priced total", async ({ page }) => {
    await gotoHome(page);
    await openTab(page, "Quotes");

    const cards = page.locator("button", { hasText: /inc\. GST/ });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      await expect(card.getByText(/#\w+/)).toBeVisible();
      await expect(
        card.getByText(/^(Draft|Sent|Approved|Rejected)$/, { exact: true }),
      ).toBeVisible();
      await expect(card.getByText(/\$[\d,.]+ inc\. GST/)).toBeVisible();
    }
  });

  test("a SENT quote can never be an empty template (critical state rule)", async ({ page }) => {
    await gotoHome(page);
    await openTab(page, "Quotes");

    const cards = page.locator("button", { hasText: /inc\. GST/ });
    const count = await cards.count();

    const sent: { client: string; total: string }[] = [];
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const badge = card.getByText(/^(Draft|Sent|Approved|Rejected)$/, { exact: true });
      const status = (await badge.textContent())?.trim();
      if (status !== "Sent") continue;

      const client = ((await card.locator("p.font-semibold").textContent()) ?? "").trim();
      const total = ((await card.getByText(/\$[\d,.]+ inc\. GST/).textContent()) ?? "").trim();

      // The audit's hard rule: a dispatched SENT quote with a $0.00 total is
      // a critical state mismatch — an empty template marked as sent.
      expect(
        { client, total },
        `SENT quote "${client}" must not be priced at $0.00`,
      ).not.toMatchObject({ total: expect.stringMatching(/^\$0\.00/) });

      sent.push({ client, total });
    }

    // Whatever SENT quotes exist must also survive a round-trip open:
    // the detail view shows the same client, not a blank template.
    for (const q of sent.slice(0, 2)) {
      await page.getByRole("button", { name: new RegExp(q.client) }).first().click();
      await expect(page.getByText(q.client).first()).toBeVisible();
      await expect(page.getByText("New client")).toHaveCount(0);
      await page.goBack();
      await openTab(page, "Quotes");
    }
  });
});
