import { defineRailway, github, postgres, preserve, project, ref, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "us-west2" });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 5000 });

  const web = service("web", {
    source: github("bushintel77-star/plumbtrack"),
    replicas: { "us-west2": 1 },
    env: { PORT: preserve() },
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
      PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER: "true",
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
