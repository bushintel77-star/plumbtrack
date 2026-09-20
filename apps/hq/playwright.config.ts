import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3200",
    viewport: { width: 1600, height: 900 },
    // Headless Chromium has no GPU — software GL keeps the MapLibre canvas
    // actually rendering (blank canvas without it, breaking map specs).
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }
  },
  webServer: {
    command: "pnpm build && npx next start -p 3200",
    url: "http://localhost:3200",
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    // Inlined at build time — forces the deterministic demo data path so the
    // suite never depends on the Fastify API or a seeded database. The test
    // bridge exposes window.__hqStore for state-level assertions.
    env: {
      NEXT_PUBLIC_HQ_FORCE_DEMO: "1",
      NEXT_PUBLIC_HQ_TEST_BRIDGE: "1"
    }
  }
})
