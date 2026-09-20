#!/usr/bin/env node
/**
 * Production bundle gate — scans built output for fabricated data that must
 * never ship: demo/seed identifiers, placeholder people, and localhost API
 * targets. Run against the PLAIN production build (no FORCE_DEMO, no dev
 * env) after `pnpm build`:
 *
 *   node scripts/check-bundle.mjs apps/hq/.next
 *
 * Any hit fails the gate with the file and pattern. Sourcemaps (.map) and
 * non-text assets are skipped. The seed ids are the strongest markers: the
 * demo modules are statically dead-code-eliminated in a plain build
 * (DEMO_SEED is false when both NODE_ENV=production and no build-time demo
 * flag), so their presence means the elimination broke — a real regression.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const FORBIDDEN = [
  { pattern: /localhost:8080/, why: "fabricated API target (the removed default)" },
  { pattern: /\bt-mike\b/, why: "demo seed technician id" },
  { pattern: /\bt-dana\b/, why: "demo seed technician id" },
  { pattern: /\bt-carlos\b/, why: "demo seed technician id" },
  { pattern: /\bt-priya\b/, why: "demo seed technician id" },
  { pattern: /\bj-10[0-9][0-9]\b/, why: "demo seed job id (j-1001…j-1010)" },
  { pattern: /Northgate Mall Facilities/, why: "demo seed client" },
  { pattern: /Mike Reyes|Dana Whitfield|Carlos Mendes|Priya Nair/, why: "demo seed person" }
]

const SCANNABLE = new Set([".js", ".html", ".css", ".txt", ".json"])

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) yield* walk(full)
    else if (SCANNABLE.has(entry.slice(entry.lastIndexOf(".")))) yield full
  }
}

const target = process.argv[2]
if (!target) {
  console.error("usage: node scripts/check-bundle.mjs <built-output-dir>")
  process.exit(2)
}

const violations = []
for (const file of walk(target)) {
  const text = readFileSync(file, "utf8")
  for (const { pattern, why } of FORBIDDEN) {
    if (pattern.test(text)) violations.push(`${file}: ${why} (${pattern})`)
  }
}

if (violations.length > 0) {
  console.error(`bundle gate FAILED — ${violations.length} violation(s) in ${target}:`)
  for (const line of violations) console.error(`  — ${line}`)
  process.exit(1)
}

console.log(`bundle gate passed — no fabricated data in ${target}`)
