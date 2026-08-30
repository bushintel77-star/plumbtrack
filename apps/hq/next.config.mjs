/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Anchor file tracing to the workspace root so the standalone output
  // preserves the `apps/hq/` layout (matches @plumbtrack/web). This keeps
  // `server.js` at `apps/hq/server.js` and the static/public COPY paths in
  // the Dockerfile correct.
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
  // Standalone output for the Railway Docker image only.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true"
    ? { output: "standalone" }
    : {}),
}

export default nextConfig
