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
6. **preDeployCommand** — restored 2026-09-04 (`pnpm --filter @plumbtrack/database db:migrate`; prisma is a runtime dep now, so the CLI ships in the image). Verify it runs cleanly on the next api deploy; the manual TCP-proxy process is the fallback.
7. ~~HQ assignment write-through~~ — DONE. `performAssignment` in `apps/hq/src/features/board/actions.ts` calls `PATCH /api/jobs/:id/assignment` live and queues the same op offline; roster hydration (see above) makes it validate against real staff.
8. **Per-operator auth** — sign-in is still shared bootstrap secrets (`HQ_BOOTSTRAP_TOKEN` owner session, public `DEVICE_BOOTSTRAP_TOKEN` enrollment); no per-user identity, no revocation. This is the next design project before onboarding a second org.

## Repository notes

- pnpm workspace: `apps/*` and `packages/*`.
- `apps/hq` is the desktop dispatch command center.
- `apps/web` is the technician mobile PWA.
- `apps/api` is Fastify + Prisma + PostgreSQL.
- `my-mobile-app/` is intentionally outside the pnpm workspace (`pnpm-workspace.yaml` with `packages: []`); treat as a separate repo.
- `FIELDLOOP_DESIGN_REFERENCES.md`, `Prototype/`, and `skills/` are untracked in the parent repo.

## Deployment notes

- Railway IaC: `.railway/railway.ts` (TypeScript). Apply with `railway up` or the Railway dashboard.
- `apps/hq` Dockerfile: `NEXT_PUBLIC_*` vars must be declared as `ARG` in the installer stage — Railway passes service variables as Docker build args, not env vars, so Next.js can inline them at build time.
- `apps/hq` `next.config.mjs`: `outputFileTracingRoot` must point at the monorepo root (`../..`), not the app dir, or standalone output breaks the `apps/hq/server.js` path.
- `apps/api` CORS: `credentials: true` is required because the HQ client sends `credentials: "include"`.
- Production Postgres has no public endpoint. To run migrations: create a TCP proxy (`railway tcp-proxy create --service Postgres <port>`), run `DATABASE_URL=... pnpm --filter @plumbtrack/database db:migrate`, then delete the proxy.
- Seeded org: `org_caulfield_south` (set as `NEXT_PUBLIC_HQ_DEV_ORG_ID` on the hq service).
