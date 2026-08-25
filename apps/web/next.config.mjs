/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dev-tools indicator badge renders at the bottom-left, on top of the
  // fixed bottom nav on phone-width viewports, and intercepts its taps.
  // Position it top-right instead (error overlays are unaffected).
  devIndicators: { buildActivityPosition: "top-right" },
  // Standalone output is only produced for the production Docker image, where
  // symlink tracing is supported. It is intentionally disabled for local and
  // CI builds so `next build` also works on Windows (symlink EPERM).
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true"
    ? { output: "standalone" }
    : {}),
};

export default nextConfig;
