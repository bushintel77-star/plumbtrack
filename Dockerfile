# syntax=docker/dockerfile:1

# PlumbTrack web — built from the FULL monorepo root so turbo prune can see the
# whole workspace (apps/*, packages/*, lockfile, pnpm-workspace.yaml, turbo.json).
# Railway uses this via builder=DOCKERFILE, dockerfilePath=/Dockerfile,
# rootDirectory=/ — do not scope this service to a subdirectory.

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# Pruner — compute the minimal workspace subset for @plumbtrack/web
# ---------------------------------------------------------------------------
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.3.3 prune @plumbtrack/web --docker

# ---------------------------------------------------------------------------
# Installer — install dependencies and build the pruned workspace
# ---------------------------------------------------------------------------
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
ENV NEXT_OUTPUT_STANDALONE=true
RUN pnpm turbo run build --filter=@plumbtrack/web

# ---------------------------------------------------------------------------
# Runner — production image using Next.js standalone output
# ---------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 nextjs

COPY --from=installer /app/apps/web/.next/standalone ./
COPY --from=installer /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
