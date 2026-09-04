import { defineConfig } from "@playwright/test";

/**
 * PlumbTrack E2E — field-app state machine and UI/UX validation.
 *
 * Runs against the Next.js dev server (reused when already on :3000).
 * Two viewports per the field-service audit matrix:
 *   - mobile  390x844  (van tablet / phone field view)
 *   - desktop 1440x900 (office view — messages deep-linking, tagged @desktop)
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  // Seed times are wall-clock relative, so a handful of specs legitimately
  // skip in some run windows; one retry absorbs the timing flake without
  // hiding real failures (retried passes are reported as flaky).
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    // Dedicated server on :3100 — the long-lived dev server stalls under
    // rapid test-context churn (blank shells that survive reloads). E2E
    // runs against a production build, which is the honest target anyway.
    baseURL: "http://127.0.0.1:3100",
    locale: "en-AU",
    timezoneId: "Australia/Melbourne",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
      grepInvert: /@desktop/,
    },
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 } },
      grep: /@desktop/,
    },
  ],
  webServer: {
    // Fresh production build per run so the suite always tests current code.
    command: "pnpm build && npx next start -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
