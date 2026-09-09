# PlumbTrack — Agent Handoff / WIP

Last updated: 2026-09-08

## Current state

- `main` on `bushintel77-star/plumbtrack` is green and deployed.
- **Branch protection is ON** (2026-09-04): `main` requires the CI check "Build, typecheck, lint and test", force-pushes and deletions blocked; `enforce_admins` is false so the owner can still push directly in an emergency. Land changes via PR.
- **2026-09-08 zero-mock / stress-test hardening pass** (branch `prod-hardening-zero-mock`, see PRODUCTION_READINESS.md for the full register). Highlights:
  - `PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER` can no longer disable auth in production (was live-demonstrated serving the whole org with no credentials); prod boots refuse to start with the flag set. Removed from `apps/api/.env`.
  - Assignment double-booking fixed (per-technician advisory-lock transaction; was 9/10 reproducible).
  - **Stripe webhook verification was broken** (Fastify 5 never attaches `request.rawBody` — every real webhook 503'd). Fixed + first signature tests. Re-verify the Stripe endpoint after deploy.
  - Slack inbound: HMAC v0 (`SLACK_SIGNING_SECRET`) + fail-closed org scoping; auth routes rate-limited 10/min/IP; read caps + org indexes on jobs (migration `20260908090000`); pull-sync cursor resumes past the cap.
  - Web PWA + HQ: production bundles carry zero fabricated business data (seeds gated to dev/test; fake Xero sync and fake Stripe URL removed; HQ Documents/Crm render only real data). Misconfig (missing `NEXT_PUBLIC_*` API URL, baked `FORCE_DEMO`) is loud in prod.
  - `apps/dispatch` no longer built/tested by CI (superseded prototype; dev/start kept).
- 2026-09-04 production-hardening pass (merged via PR #3/#4/#5/#6):
  - Tenant hook exempts the signature-verified webhooks (`POST /api/webhooks/stripe`, `POST /api/slack/events`) — they were 401'd in production before.
  - Closed cross-tenant holes: checklist-item PATCH (org-scoped), photo DELETE (parent job org-verified), quote-line PATCH (scoped to the org-verified quote).
  - CORS fails closed: `buildApp` refuses to boot in production without `CORS_ORIGINS`.
  - Media `publicUrl` comes from `PUBLIC_API_BASE_URL` (set in `.railway/railway.ts`); request-Host derivation is dev/test only.
  - `POST /api/sms/eta` has its own rate limit (`SMS_RATE_LIMIT_MAX`, default 10/min per IP).
  - Global error handler (5xx bodies sanitized in production), `x-request-id` honoured via `genReqId`, pino redacts cookie/authorization headers.
  - Technicians may `PATCH /api/jobs/:id` with only `{status, signature}` (field sign-off); all other fields stay manager+.
  - `GET /api/board` returns `staff` (org roster with skills); HQ `hydrateFromApi` replaces the seed technicians with it — drag-to-assign now validates against real member ids.
  - HQ offline queue drains assign ops through `PATCH /api/jobs/:id/assignment` (was silently sending empty status PATCHes).
  - Web PWA queues `update-job` outbox ops for job status/sign-off; the 5s poll protects pending-op jobs from reverting them. Log Out now clears the auth session.
  - `.railway/railway.ts` restores `preDeployCommand` migrations (prisma is now a runtime dep, so the CLI is in the image) — **verify on next api deploy**.

- `main` on `bushintel77-star/plumbtrack` is green and deployed.
- Latest commit: `fdcc323b` — CORS credentials fix for cross-origin HQ→API requests.
- All four Railway services are live and Online:

| Service | URL | Notes |
|---|---|---|
| web | https://web-production-364b4f.up.railway.app | Technician mobile PWA |
| hq | https://hq-production-7911.up.railway.app | Dispatch command center (Live data mode) |
| api | https://api-production-363e.up.railway.app | Fastify + Prisma + Postgres |
| Postgres | (internal) | 15 migrations applied, seeded with `org_caulfield_south` |

- HQ board fetches real data from `GET /api/board` (G-1) and shows "Live" badge.
- `PATCH /api/jobs/:id/assignment` (G-2) was already implemented.
- `my-mobile-app/` is an untracked Expo project with its own `.git`; it builds and exports for web.

## Verified commands

```sh
# Full gate
pnpm install
pnpm typecheck
pnpm test

# Per-surface builds
pnpm --filter @plumbtrack/api build
pnpm --filter @plumbtrack/web build
pnpm --filter @plumbtrack/hq build

# Mobile (from my-mobile-app/)
cd my-mobile-app
pnpm typecheck
pnpm test
pnpm exec expo export --platform web
```

## In-flight / next actions

1. ~~HQ deployment~~ — DONE. Live at `https://hq-production-7911.up.railway.app`.
2. ~~API deployment~~ — DONE. Live at `https://api-production-363e.up.railway.app`.
3. ~~G-1/G-2 endpoints~~ — DONE. `GET /api/board` implemented; `PATCH /api/jobs/:id/assignment` was already present.
4. **Object storage** — connect S3/R2 for photos and compliance docs; `fileUrl` is currently `null`.
5. **Mobile native build** — `my-mobile-app` needs iOS/Android native builds and a custom dev-client for WatermelonDB SQLite.
6. ~~preDeployCommand~~ — DONE + verified 2026-09-04: migrations ran cleanly via `preDeployCommand` on the api deploys of commit `2de7c008` (a failing preDeploy fails the deployment, so SUCCESS proves it). The manual TCP-proxy process is only a fallback now.
7. ~~HQ assignment write-through~~ — DONE. `performAssignment` in `apps/hq/src/features/board/actions.ts` calls `PATCH /api/jobs/:id/assignment` live and queues the same op offline; roster hydration (see above) makes it validate against real staff.
8. **Per-operator auth** — sign-in is still shared bootstrap secrets (`HQ_BOOTSTRAP_TOKEN` owner session, public `DEVICE_BOOTSTRAP_TOKEN` enrollment); no per-user identity, no revocation. This is the next design project before onboarding a second org.

## Repository notes

- pnpm workspace: `apps/*` and `packages/*`.
- `apps/hq` is the desktop dispatch command center.
- `apps/web` is the technician mobile PWA.
- `apps/api` is Fastify + Prisma + PostgreSQL.
- `my-mobile-app/` (Expo field agent) now has its own private remote: `bushintel77-star/plumbtrack-mobile` (branch `master`). The local folder's `origin` points there — do NOT push it at the monorepo. It is still intentionally outside the pnpm workspace.
- CI has two jobs: the required full gate (typecheck/lint/test/build) and a Playwright web-e2e job (27 specs; `dashboard-graphs` and `job-view-billable` are grep-excluded — seed-era drift, see PRODUCTION_READINESS.md P0-2). The HQ Playwright suite is fully stale (pre-FieldLoop shell) and is not wired anywhere.
- `apps/dispatch` is the superseded Electron reference prototype (echo test, built by CI, deployed nowhere).
- `FIELDLOOP_DESIGN_REFERENCES.md`, `Prototype/`, and `skills/` are untracked in the parent repo.

## Deployment notes

- Railway IaC: `.railway/railway.ts` (TypeScript). **Apply with `railway config plan` + `railway config apply --yes`** — `railway up` alone does NOT apply the IaC file (it deploys local source with whatever builder the service currently has).
- **2026-09-09 deploy-drift incident**: GitHub auto-deploy stopped triggering after 2026-09-07 and the web service had silently lost its `builder: DOCKERFILE` pin (fell back to Railpack, which fails the monorepo with "No start command detected"). The api service had also lost `preDeployCommand` (deploys ran WITHOUT migrations) and `HQ_APP_URL`. Production ran three merges behind through PRs #4–#6 unnoticed. Fixed via `railway config apply --yes` + manual `railway up -s <svc> -c -y` per service; all three services then verified live on PR #7 code (rate-limit probe, bundle markers). **Still open: GitHub auto-deploy doesn't fire on push to main — check the Railway GitHub app connection in the dashboard.** After any IaC change, verify with `railway deployment list -s <svc>` that the deploy is SUCCESS, not just that `railway up` exited 0.
- Useful deploy-log commands: `railway logs -s <svc> -b -n 200 <deployment-id>` (build logs — this is how the Railpack failure was found), `railway logs -s <svc> -d` (deploy stage). A FAILED deployment with no container logs and no `imageDigest` in its meta = transient image-push failure; just retry the deploy.
- `apps/hq` + `apps/web` Dockerfiles: `NEXT_PUBLIC_*` vars must be declared as `ARG` in the installer stage — Railway passes service variables as Docker build args, not env vars, so Next.js can inline them at build time. (apps/web was missing its ARG block until 2026-09-09: the prod bundle carried a baked `localhost:8080` apiUrl and field devices silently ran local-only. Fixed + verified in the bundle.)
- `apps/hq` `next.config.mjs`: `outputFileTracingRoot` must point at the monorepo root (`../..`), not the app dir, or standalone output breaks the `apps/hq/server.js` path.
- `apps/api` CORS: `credentials: true` is required because the HQ client sends `credentials: "include"`.
- Production Postgres has no public endpoint. To run migrations: create a TCP proxy (`railway tcp-proxy create --service Postgres <port>`), run `DATABASE_URL=... pnpm --filter @plumbtrack/database db:migrate`, then delete the proxy.
- Seeded org: `org_caulfield_south` (set as `NEXT_PUBLIC_HQ_DEV_ORG_ID` on the hq service).
- **Local live-mode stack (2026-09-06)**: two traps. (1) This machine has a *global* Windows env `DATABASE_URL=postgres://…kellybet` (another project); Node's `--env-file` lets real env win over `.env`, so start the api with an explicit override: `DATABASE_URL="$(grep ^DATABASE_URL= apps/api/.env | cut -d= -f2- | tr -d '\r"')" pnpm exec tsx --env-file=.env src/index.ts`. Otherwise the api silently runs against the kellybet DB and `/api/board` 500s with Prisma P2022. (2) A local HQ production build needs `NEXT_PUBLIC_HQ_DEV_ORG_ID=org_caulfield_south NEXT_PUBLIC_HQ_API_URL=http://localhost:8080` at build time or the org header mismatches and the board demo-latches. Local demo of the map also needs geocoded jobs — re-PATCH each job's address to populate `lat/lng` via the live heigit proxy.
- HQ transient-failure behaviour (2026-09-06): the basemap ladder (`src/lib/basemapLadder.ts`) walks style candidates × 3 passes before the MAP UNAVAILABLE fallback; the connection badge (`fl-connection`) becomes a "Demo data · reconnect" button when the board demo-latches after a transient failure — one click re-arms the live query.
- **Local stack runs detached (2026-09-07)**: `powershell -ExecutionPolicy Bypass -File apps/api/.start-detached.ps1` and `apps/hq/.start-detached.ps1` start each server as a hidden process that survives agent sessions/terminals (logs: `apps/*/.local-*.log`). Background shells tied to an agent session get reaped — do not run the dev servers as agent background tasks. The light-theme basemap leads with OSM Liberty (full colour); positron/carto are ladder fallbacks. HQ sessions expire — a 401 on `/api/board` means re-mint via `POST /api/auth/hq-session` (dev: org header `org_caulfield_south`), not missing data.
- **Windows traps (2026-09-08 stress test)**: (1) a stale detached `tsx src/index.ts` from an old session holds the Prisma engine DLL — every `pnpm typecheck`/`build` then dies with `EPERM … query_engine-windows.dll.node`, and the process also squats port 8080. Find the holder with `powershell -ExecutionPolicy Bypass -File scripts/find-prisma-lock.ps1`, kill it, rerun `prisma generate`. (2) The global kellybet `DATABASE_URL` DB is *contaminated*: it contains a partial plumbtrack schema with seeded `org_caulfield_south` rows — never trust "orgs exist" as proof you're on the right DB. (3) Reusable load/race/brute probes live in `scripts/` (`load-probe.mjs`, `race-once.mjs`, `brute-probe.mjs`); run node scripts with `MSYS_NO_PATHCONV=1` when passing `/api/...` args or Git Bash rewrites them to Windows paths.
