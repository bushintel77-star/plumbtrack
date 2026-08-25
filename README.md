# PlumbTrack

Field-service SaaS foundation for Caulfield South Plumbing: capture job scope,
clock billable time on site, attach before/after photos, collect client
signatures, generate invoices, and send quotes for client approval. Production
requests use signed bearer sessions; the organization header is retained only as
a local development compatibility fallback.

## Monorepo layout

```
apps/
  api/          Fastify + Prisma + Zod REST API
  web/          Next.js 15 (App Router) + Tailwind + Lucide React
packages/
  database/     Prisma schema, client singleton, migrations and seed
  tsconfig/     Shared TypeScript configurations
  eslint-config/ Shared ESLint configurations
```

## Prerequisites

- Node.js >= 20
- pnpm 10
- PostgreSQL 16

## Getting started

```bash
pnpm install

# 1. Configure the database
cp .env.example .env            # or set DATABASE_URL in your environment

# 2. Generate the Prisma client and apply migrations
pnpm db:generate
pnpm db:migrate

# 3. Seed demo data (organisation, jobs and a quote)
pnpm db:seed

# 4. Run the API and web app
pnpm dev
```

- API: http://localhost:8080 (health check at `GET /api/health`)
- Web: http://localhost:3000

The web app reads `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8080`).
If the API is unreachable it falls back to an embedded demo seed so the UI
remains explorable offline.

## Scripts

| Script          | Description                                   |
| --------------- | --------------------------------------------- |
| `pnpm build`    | Build all workspaces                          |
| `pnpm dev`      | Run API and web in watch mode                 |
| `pnpm lint`     | Lint all workspaces                           |
| `pnpm typecheck`| Type-check all workspaces                     |
| `pnpm test`     | Run unit tests                                |
| `pnpm db:generate` | Generate the Prisma client                 |
| `pnpm db:migrate`  | Apply pending Prisma migrations             |
| `pnpm db:seed`     | Seed the demo organisation and records      |

## API

Protected API routes resolve tenancy from a signed bearer session:

```
Authorization: Bearer <session-token>
```

The session carries `userId`, `organizationId`, `role`, and an expiry. Configure
`AUTH_SECRET` in every deployed environment and set
`PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER=false`. The `x-organization-id` header
is accepted only outside production for the local demo and test fixtures; when
both are supplied it must match the signed session organization.

The API exposes `GET /api/auth/session` for session introspection. A real
identity provider/session issuer and membership provisioning flow should issue
these tokens before pilot use. Request bodies are validated with Zod. See
`apps/api/src/schemas/` for contracts and `apps/api/src/routes/` for handlers.

## Containerization

Multi-stage production images are provided for both applications:

```bash
docker build -f apps/api/Dockerfile -t plumbtrack-api .
docker build -f apps/web/Dockerfile -t plumbtrack-web .
```

Both use `turbo prune` to ship only the required workspace subset.
