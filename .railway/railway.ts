import { defineRailway, postgres, project, service } from "railway/iac";

// PlumbTrack — web-only deployment. The web service builds from the repo root
// via the root Dockerfile (turbo prune → Next.js standalone), so it must NOT
// be scoped to a subdirectory: the full monorepo context is what pnpm
// workspaces and turbo prune require.
export default defineRailway(() => {
  const db = postgres("postgres");

  const web = service("web", {
    healthcheck: "/",
  });

  return project("plumbtrack", {
    resources: [db, web],
  });
});
