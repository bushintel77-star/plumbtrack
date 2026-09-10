import { bucket, defineRailway, github, postgres, preserve, project, ref, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "us-west2" });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 5000 });

  // S3-compatible object storage for photo/evidence uploads. The api reads the
  // bucket's injected credentials; photo reads are served by the API itself.
  // Region sjc = US West, matching the web/api/hq services.
  const MediaBucket = bucket("plumbtrack-media", { region: "sjc" });

  const api = service("api", {
    source: github("bushintel77-star/plumbtrack"),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/api/Dockerfile",
    },
    deploy: {
      healthcheckPath: "/api/health",
      // Migrations ship with the image (prisma + packages/database/prisma are
      // copied in the Dockerfile) and prisma is a runtime dependency, so the
      // CLI is present in the runner. Auto-migrate on every deploy — the
      // previous manual TCP-proxy process left schema drift (see migration
      // 20260831000300).
      preDeployCommand: "pnpm --filter @plumbtrack/database db:migrate",
      startCommand: "node apps/api/dist/index.js",
    },
    env: {
      PORT: "8080",
      DATABASE_URL: ref(Postgres, "DATABASE_URL"),
      // Public base URL for persisted media read URLs. Required in production:
      // without it the API derives URLs from the request Host header (spoofable)
      // and refuses to complete photo uploads instead of storing untrusted URLs.
      PUBLIC_API_BASE_URL: "https://api-production-363e.up.railway.app",
      // Where the Slack OAuth callback redirects the installer's browser back
      // to (the HQ Slack surface reads ?slack_connect=connected|denied|failed).
      HQ_APP_URL: "https://hq-production-7911.up.railway.app",
      // Production auth is on: the legacy x-organization-id owner fallback is
      // rejected. Sessions require the secrets below, which are set in the
      // Railway dashboard (never committed). Set AUTH_SECRET, HQ_BOOTSTRAP_TOKEN
      // and DEVICE_BOOTSTRAP_TOKEN BEFORE applying this config — the API fails
      // to boot without AUTH_SECRET when production auth is enabled.
      PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER: "false",
      AUTH_SECRET: preserve(),
      HQ_BOOTSTRAP_TOKEN: preserve(),
      DEVICE_BOOTSTRAP_TOKEN: preserve(),
      // Station sign-in scope and role (dispatcher|manager|accountant|admin|owner).
      HQ_ORG_ID: "org_caulfield_south",
      DEVICE_ORG_ID: "org_caulfield_south",
      HQ_OPERATOR_ROLE: "owner",
      // Explicit allowlist — credentials:true must never pair with a reflected
      // origin. Update if the web/hq services are recreated with new domains.
      CORS_ORIGINS: "https://web-production-364b4f.up.railway.app,https://hq-production-7911.up.railway.app",
      // Object storage (photo/evidence). The bucket credentials inject via env
      // refs, but Railway materialised them empty at apply time (bucket was
      // created in the same apply). Set the BUCKET_* values in the dashboard
      // (see `railway bucket credentials --bucket plumbtrack-media`) and keep
      // these as preserve() so IaC never clobbers them.
      MEDIA_STORAGE_ENDPOINT: preserve(),
      MEDIA_STORAGE_ACCESS_KEY_ID: preserve(),
      MEDIA_STORAGE_SECRET_ACCESS_KEY: preserve(),
      MEDIA_STORAGE_BUCKET: preserve(),
      MEDIA_STORAGE_REGION: "auto",
      // Twilio SMS (customer ETA notifications) — set in the dashboard.
      TWILIO_ACCOUNT_SID: preserve(),
      TWILIO_AUTH_TOKEN: preserve(),
      TWILIO_FROM_NUMBER: preserve(),
      // OpenRouteService key for the routing proxy (server-side only; the HQ
      // client calls /api/routing/*, never the provider directly). Set in the
      // dashboard — without it the proxy answers 503 and the map keeps
      // straight-line dashed routes.
      ORS_API_KEY: preserve(),
    },
    replicas: { "us-west2": 1 },
  });

  const web = service("web", {
    source: github("bushintel77-star/plumbtrack"),
    // 2026-09-10: this service now serves the **FieldLoop field agent** — the
    // Expo app in the plumbtrack-mobile repo (local: my-mobile-app/). Deploys
    // run `railway up -s web` FROM that repo's checkout, so dockerfilePath is
    // relative to THAT root ("Dockerfile" at its top level). The superseded
    // first-draft PWA (apps/web) remains in the monorepo but is no longer
    // deployed to this URL.
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    replicas: { "us-west2": 1 },
    env: {
      PORT: preserve(),
      // EXPO_PUBLIC_* are inlined at BUILD time (declared as Dockerfile ARGs
      // in plumbtrack-mobile's Dockerfile). Build-time vars must be LITERALS:
      // a ref() resolves at runtime only and never reaches the Docker build
      // (live-verified 2026-09-09 failure mode). If the api domain changes,
      // update here. DEVICE_BOOTSTRAP_TOKEN must match the api service's
      // DEVICE_BOOTSTRAP_TOKEN — it is public-by-design (it ships in the
      // browser bundle), production auth relies on api-side revocation work.
      EXPO_PUBLIC_API_URL: "https://api-production-363e.up.railway.app",
      EXPO_PUBLIC_ORG_ID: "org_caulfield_south",
      EXPO_PUBLIC_DEVICE_BOOTSTRAP_TOKEN: preserve(),
    },
  });

  const hq = service("hq", {
    source: github("bushintel77-star/plumbtrack"),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/hq/Dockerfile",
    },
    deploy: {
      healthcheckPath: "/",
      startCommand: "node apps/hq/server.js",
    },
    env: {
      PORT: "3000",
      // Build-time literal (see the web service note): refs do not resolve at
      // Docker-build time, so the console bundle needs the literal URL.
      NEXT_PUBLIC_HQ_API_URL: "https://api-production-363e.up.railway.app",
      // Seeded org the HQ board falls back to in demo mode — preserved, not
      // deleted, by the IaC import.
      NEXT_PUBLIC_HQ_DEV_ORG_ID: preserve(),
    },
    replicas: { "us-west2": 1 },
  });

  return project("plumbtrack", {
    resources: [Postgres, web, api, hq, postgresVolume, MediaBucket],
  });
});
