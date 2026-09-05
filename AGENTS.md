# PlumbTrack — Agent Handoff / WIP

Last updated: 2026-09-04

## Current state

- `main` on `bushintel77-star/plumbtrack` is green and deployed.
- **Branch protection is ON** (2026-09-04): `main` requires the CI check "Build, typecheck, lint and test", force-pushes and deletions blocked; `enforce_admins` is false so the owner can still push directly in an emergency. Land changes via PR.
- 2026-09-04 production-hardening pass (uncommitted local work at time of writing):
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

- Railway IaC: `.railway/railway.ts` (TypeScript). Apply with `railway up` or the Railway dashboard.
- `apps/hq` Dockerfile: `NEXT_PUBLIC_*` vars must be declared as `ARG` in the installer stage — Railway passes service variables as Docker build args, not env vars, so Next.js can inline them at build time.
- `apps/hq` `next.config.mjs`: `outputFileTracingRoot` must point at the monorepo root (`../..`), not the app dir, or standalone output breaks the `apps/hq/server.js` path.
- `apps/api` CORS: `credentials: true` is required because the HQ client sends `credentials: "include"`.
- Production Postgres has no public endpoint. To run migrations: create a TCP proxy (`railway tcp-proxy create --service Postgres <port>`), run `DATABASE_URL=... pnpm --filter @plumbtrack/database db:migrate`, then delete the proxy.
- Seeded org: `org_caulfield_south` (set as `NEXT_PUBLIC_HQ_DEV_ORG_ID` on the hq service).
- **Local live-mode stack (2026-09-06)**: two traps. (1) This machine has a *global* Windows env `DATABASE_URL=postgres://…kellybet` (another project); Node's `--env-file` lets real env win over `.env`, so start the api with an explicit override: `DATABASE_URL="$(grep ^DATABASE_URL= apps/api/.env | cut -d= -f2- | tr -d '\r"')" pnpm exec tsx --env-file=.env src/index.ts`. Otherwise the api silently runs against the kellybet DB and `/api/board` 500s with Prisma P2022. (2) A local HQ production build needs `NEXT_PUBLIC_HQ_DEV_ORG_ID=org_caulfield_south NEXT_PUBLIC_HQ_API_URL=http://localhost:8080` at build time or the org header mismatches and the board demo-latches. Local demo of the map also needs geocoded jobs — re-PATCH each job's address to populate `lat/lng` via the live heigit proxy.
- HQ transient-failure behaviour (2026-09-06): the basemap ladder (`src/lib/basemapLadder.ts`) walks style candidates × 3 passes before the MAP UNAVAILABLE fallback; the connection badge (`fl-connection`) becomes a "Demo data · reconnect" button when the board demo-latches after a transient failure — one click re-arms the live query.
