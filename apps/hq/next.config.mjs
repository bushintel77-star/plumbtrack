/** @type {import('next').NextConfig} */
import { fileURLToPath } from "node:url"
import path from "node:path"

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // Standalone output for the Railway Docker image only.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true"
    ? { output: "standalone" }
    : {}),
}

export default nextConfig
