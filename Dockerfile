# PlumbTrack web — built from the FULL monorepo root so turbo prune can see the
# whole workspace (apps/*, packages/*, lockfile, pnpm-workspace.yaml, turbo.json).
# Railway uses this via builder=DOCKERFILE, dockerfilePath=/Dockerfile,
# rootDirectory=/ — do not scope this service to a subdirectory.
#
# NOTE: no `# syntax=docker/dockerfile:1` directive — this file uses only
# stable multi-stage features, and the frontend-image fetch that the directive
# triggers fails the build pre-execution on Railway's Metal builders.

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
# NEXT_PUBLIC_* vars must be present at build time for Next.js to inline them
# into the client bundle. Railway service variables are not automatically
# available during Docker builds, so accept them as build args. Empty values
# fall back to the app's code defaults (see apps/web/src/lib/config.ts).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ORG_ID
ARG NEXT_PUBLIC_DEVICE_BOOTSTRAP_TOKEN
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_ORG_NAME
ARG NEXT_PUBLIC_STANDARD_RATE
ARG NEXT_PUBLIC_CALLOUT_FEE
ARG NEXT_PUBLIC_STAFF_HOURLY_RATE
ARG NEXT_PUBLIC_CENTS_PER_KM
ARG NEXT_PUBLIC_API_TIMEOUT_MS
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ORG_ID=$NEXT_PUBLIC_ORG_ID
ENV NEXT_PUBLIC_DEVICE_BOOTSTRAP_TOKEN=$NEXT_PUBLIC_DEVICE_BOOTSTRAP_TOKEN
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_ORG_NAME=$NEXT_PUBLIC_ORG_NAME
ENV NEXT_PUBLIC_STANDARD_RATE=$NEXT_PUBLIC_STANDARD_RATE
ENV NEXT_PUBLIC_CALLOUT_FEE=$NEXT_PUBLIC_CALLOUT_FEE
ENV NEXT_PUBLIC_STAFF_HOURLY_RATE=$NEXT_PUBLIC_STAFF_HOURLY_RATE
ENV NEXT_PUBLIC_CENTS_PER_KM=$NEXT_PUBLIC_CENTS_PER_KM
ENV NEXT_PUBLIC_API_TIMEOUT_MS=$NEXT_PUBLIC_API_TIMEOUT_MS
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
