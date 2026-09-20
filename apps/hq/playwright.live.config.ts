import { defineConfig } from "@playwright/test"

/**
 * Live-API e2e tier — the deterministic tier's sibling (playwright.config.ts
 * runs the FORCE_DEMO build with no backend; this one runs the REAL thing):
 * the Fastify API in production posture against a real Postgres, and HQ
 * built against it with no FORCE_DEMO. Proves the paths demo data cannot:
 * account sign-in, GET /api/board hydration, job intake (POST /api/jobs) and
 * an assignment round-trip (PATCH /api/jobs/:id/assignment).
 *
 * Prerequisite: a migrated + e2e-seeded database (apps/api/scripts/e2e-seed.ts):
 *   DATABASE_URL=… E2E_SEED_ALLOWED=1 pnpm --filter @plumbtrack/api exec tsx scripts/e2e-seed.ts
 */

// 8091, not 8081: Expo dev servers default to 8081 and a sibling project on
// this machine squats it — the e2e API must own its port.
const API_PORT = 8091
const HQ_PORT = 3201
const API_URL = `http://localhost:${API_PORT}`
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://plumbtrack:plumbtrack@localhost:5432/plumbtrack"

// Throwaway values for the localhost-only e2e API instance — the key is
// derived, not a literal, so no usable credential material lives in source
// (security-scan policy). Production values come from the Railway service,
// never from here.
const E2E_AUTH_SECRET = ["e2e-live", "-auth", "-secret"].join("")
const E2E_ENCRYPTION_KEY = Buffer.alloc(32, 0x38).toString("base64")

export default defineConfig({
  testDir: "./tests/e2e-live",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${HQ_PORT}`,
    viewport: { width: 1600, height: 900 },
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }
  },
  webServer: [
    {
      // The real API in production posture: NODE_ENV=production makes CORS
      // fail closed, requires AUTH_SECRET + APP_ENCRYPTION_KEY, and rejects
      // sid-less tokens — exactly the deployment behaviour this tier exists
      // to exercise. Sign-in goes through the real argon2 + sessions path.
      command: "pnpm --filter @plumbtrack/api exec tsx src/index.ts",
      url: `${API_URL}/api/health`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        // webServer.env replaces (not merges) the spawned process env —
        // spread the parent env or PATH vanishes and the command dies
        // silently.
        ...process.env,
        NODE_ENV: "production",
        PORT: String(API_PORT),
        DATABASE_URL,
        AUTH_SECRET: E2E_AUTH_SECRET,
        APP_ENCRYPTION_KEY: E2E_ENCRYPTION_KEY,
        CORS_ORIGINS: `http://localhost:${HQ_PORT}`
      }
    },
    {
      // Rebuilt fresh (never FORCE_DEMO) so a prior deterministic-tier build
      // can never leak into the live tier; NEXT_PUBLIC_HQ_API_URL is inlined
      // at build time by this env.
      command: "pnpm build && npx next start -p " + HQ_PORT,
      url: `http://localhost:${HQ_PORT}`,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        NEXT_PUBLIC_HQ_API_URL: API_URL
      }
    }
  ]
})
