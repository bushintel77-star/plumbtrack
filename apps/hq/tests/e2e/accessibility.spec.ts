import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

/**
 * Phase 0 axe scaffolding — REPORT-ONLY baseline. Violations are logged to
 * the run output and attached as JSON per surface; they never fail CI. The
 * enforcement ratchet (fail-on-violation with an allowlist) lands in the
 * Phase 5 accessibility pass once the baseline is known and the real fixes
 * are in scope. Changing this to fail-before-Phase-5 is a scope decision,
 * not a test tweak.
 */

const ROUTES: Array<[string, string]> = [
  ["dispatch", "/"],
  ["map", "/?surface=map"],
  ["documents", "/?surface=documents"],
  ["crm", "/?surface=crm"],
  ["reports", "/?surface=reports"],
  ["slack", "/?surface=slack"]
]

for (const [name, route] of ROUTES) {
  test(`axe baseline — ${name}`, async ({ page }, testInfo) => {
    await page.goto(route)
    await page.getByTestId("fieldloop-workspace").waitFor()
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze()
    const summary = results.violations.map(
      violation => `${violation.impact ?? "unknown"} · ${violation.id} · ${violation.nodes.length} node(s) · ${violation.help}`
    )
    console.log(`[axe:${name}] ${results.violations.length} violation type(s)`)
    for (const line of summary) console.log(`  — ${line}`)
    await testInfo.attach(`axe-${name}`, {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json"
    })
    // Report-only: the scan must run and produce a verdict.
    expect(Array.isArray(results.violations)).toBe(true)
  })
}
