import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * FieldLoop colour gate (mobile) — the port of apps/hq's gate, adapted for
 * React Native: semantic tokens only in src/, no colour-named Tailwind
 * palette classes and no arbitrary-hex className values. Two channels are
 * deliberately ALLOWED:
 *   - explicit `color="#..."` style props (Lucide icons cannot take
 *     className; the hexes there mirror token values), and
 *   - src/global.css (the token definition file itself).
 */
const root = join(process.cwd(), "src")
const forbidden =
  /(?:text|bg|border|ring|from|to|via)-(?:red|green|amber|yellow|orange|blue|slate|gray|zinc|emerald|teal|purple|violet|indigo|pink|rose)-\d+(?:\/\d+)?|(?:text|bg|border|ring|from|to|via)-\[#/g

const targets = []
function visit(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) visit(path)
    else if (/\.(tsx?|jsx?)$/.test(entry) && !path.endsWith("global.css")) targets.push(path)
  }
}
visit(root)

const failures = []
for (const path of targets) {
  const text = readFileSync(path, "utf8")
  for (const match of text.matchAll(forbidden)) {
    failures.push(`${relative(process.cwd(), path)}: ${match[0]}`)
  }
}

if (failures.length) {
  console.error("Color gate failed; use the FieldLoop semantic tokens instead:\n" + failures.join("\n"))
  process.exit(1)
}
console.log(`Color gate passed (${targets.length} files scanned)`)
