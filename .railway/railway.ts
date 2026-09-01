import { defineRailway, github, postgres, preserve, project, ref, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "us-west2" });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 5000 });

  const web = service("web", {
    source: github("bushintel77-star/plumbtrack"),
    replicas: { "us-west2": 1 },
    env: {
      PORT: preserve(),
      // NEXT_PUBLIC_* are inlined at build time (declared as Dockerfile ARGs).
      // DEVICE_BOOTSTRAP_TOKEN must match the api service's DEVICE_BOOTSTRAP_TOKEN
      // (set in the dashboard) or field enrollment will fail after the legacy
      // tenant header is disabled.
      NEXT_PUBLIC_API_URL: ref(api, "RAILWAY_PUBLIC_DOMAIN"),
      NEXT_PUBLIC_ORG_ID: "org_caulfield_south",
      NEXT_PUBLIC_DEVICE_BOOTSTRAP_TOKEN: preserve(),
    },
  });

  const api = service("api", {
    source: github("bushintel77-star/plumbtrack"),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/api/Dockerfile",
    },
    deploy: {
      healthcheckPath: "/api/health",
      startCommand: "node apps/api/dist/index.js",
      preDeployCommand: "pnpm --filter @plumbtrack/database db:migrate",
    },
    env: {
      PORT: "8080",
      DATABASE_URL: ref(Postgres, "DATABASE_URL"),
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
    },
    replicas: { "us-west2": 1 },
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
      NEXT_PUBLIC_HQ_API_URL: ref(api, "RAILWAY_PUBLIC_DOMAIN"),
    },
    replicas: { "us-west2": 1 },
  });

  return project("plumbtrack", {
    resources: [Postgres, web, api, hq, postgresVolume],
  });
});
