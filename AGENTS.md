# PlumbTrack — Agent Handoff / WIP

Last updated: 2026-08-31

## Current state

- `main` on `bushintel77-star/plumbtrack` is green and deployed.
- Latest commit: `9216397a` — FieldLoop bug fixes + missing untracked files.
- `apps/web` Railway service is live at `https://web-production-364b4f.up.railway.app`.
- `apps/hq` and `apps/api` are **not** deployed to Railway (only `web` service exists).
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

1. **HQ deployment** — `apps/hq` needs a Railway service (Dockerfile or Nixpacks) and `PLUMBTRACK_HQ_API_URL` / database wiring.
2. **API deployment** — `apps/api` needs a Railway service with Postgres volume and `DATABASE_URL`.
3. **G-1/G-2 endpoints** — implement `GET /api/board` and `PATCH /api/jobs/:id/assignment` so the HQ board uses real data and server-validated writes.
4. **Object storage** — connect S3/R2 for photos and compliance docs; `fileUrl` is currently `null`.
5. **Mobile native build** — `my-mobile-app` needs iOS/Android native builds and a custom dev-client for WatermelonDB SQLite.

## Repository notes

- pnpm workspace: `apps/*` and `packages/*`.
- `apps/hq` is the desktop dispatch command center.
- `apps/web` is the technician mobile PWA.
- `apps/api` is Fastify + Prisma + PostgreSQL.
- `my-mobile-app/` is intentionally outside the pnpm workspace (`pnpm-workspace.yaml` with `packages: []`); treat as a separate repo.
- `FIELDLOOP_DESIGN_REFERENCES.md`, `Prototype/`, and `skills/` are untracked in the parent repo.
