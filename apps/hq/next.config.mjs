/** @type {import('next').NextConfig} */
import { fileURLToPath } from "node:url"
import path from "node:path"

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url))
}

export default nextConfig
