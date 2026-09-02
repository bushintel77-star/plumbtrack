# syntax=docker/dockerfile:1

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# Pruner — compute the minimal workspace subset for @plumbtrack/api
# ---------------------------------------------------------------------------
FROM base AS pruner
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN pnpm dlx turbo@2.3.3 prune @plumbtrack/api --docker

# ---------------------------------------------------------------------------
# Installer — install dependencies and build the pruned workspace
# ---------------------------------------------------------------------------
FROM base AS installer
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
COPY packages/database/prisma ./packages/database/prisma
RUN pnpm turbo run build --filter=@plumbtrack/api

# ---------------------------------------------------------------------------
# Runner — production image
# ---------------------------------------------------------------------------
FROM base AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
COPY --from=installer /app ./
# Prisma migrations + schema must be present in the runner so the pre-deploy
# `db:migrate` step (which runs in this image before startCommand) can apply
# them. `prisma` is now a runtime dependency of @plumbtrack/database, and the
# installer build also emitted the generated client into node_modules.
COPY packages/database/prisma ./packages/database/prisma
COPY packages/database/dist ./packages/database/dist
EXPOSE 8080
CMD ["node", "apps/api/dist/index.js"]
