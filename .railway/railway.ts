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
      startCommand: "node apps/api/dist/index.js",
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
    },
    replicas: { "us-west2": 1 },
  });

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
