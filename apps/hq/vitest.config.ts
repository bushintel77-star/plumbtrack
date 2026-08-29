import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    include: ["tests/unit/**/*.spec.ts", "tests/unit/**/*.spec.tsx"],
    // Component specs need a DOM; pure engine specs stay on the fast node env.
    environmentMatchGlobs: [["tests/unit/**/*.spec.tsx", "jsdom"]]
  }
})
