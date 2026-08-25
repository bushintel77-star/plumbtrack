import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgresql://plumbtrack:plumbtrack@localhost:5432/plumbtrack_test",
    },
  },
});
