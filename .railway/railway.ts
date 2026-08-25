import { Config } from "@railway/config";

export default Config({
  project: "7d6513da-24de-401d-b539-691cb811ada8",
  services: {
    "plumbtrack-api": {
      rootDirectory: "apps/api",
      buildCommand: "cd /app && pnpm install --frozen-lockfile && pnpm turbo run build --filter=@plumbtrack/api",
      startCommand: "node apps/api/dist/index.js",
    },
    "plumbtrack-web": {
      rootDirectory: "apps/web",
      buildCommand: "cd /app && pnpm install --frozen-lockfile && pnpm turbo run build --filter=@plumbtrack/web",
      startCommand: "node apps/web/server.js",
      healthcheckPath: "/",
    },
  },
});
