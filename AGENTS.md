# PlumbTrack — Agent Handoff / WIP

Last updated: 2026-08-31

## Current state

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
6. **preDeployCommand** — api service has `pnpm --filter @plumbtrack/database db:migrate` set as preDeployCommand but it failed on first attempt (prisma CLI not found in runner image). Migrations were run manually via TCP proxy (now removed). The preDeployCommand may need fixing for future auto-migrations — verify on next api deploy.
7. **HQ assignment write-through** — the board's drag-to-assign calls `canAssign` locally but does not yet call `PATCH /api/jobs/:id/assignment` over the network. The `authApi.assignment` helper exists in `apps/hq/src/lib/api.ts` but `assignJob` in `boardStore.ts` only updates local state.

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
