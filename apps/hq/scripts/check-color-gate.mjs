import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const root = join(process.cwd(), "src")
const forbidden = /(?:text|bg|border|ring|from|to|via)-(?:red|green|amber|yellow|orange|blue|slate|gray|emerald|teal)-\d+(?:\/\d+)?|(?:text|bg|border|ring)-\[#/g
const targets = []
function visit(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) visit(path)
    else if (/\.(tsx?|jsx?)$/.test(entry) && (path.includes(`${join("src", "features")}`) || path.includes(`${join("src", "components")}`))) targets.push(path)
  }
}
visit(root)
const failures = []
for (const path of targets) {
  const text = readFileSync(path, "utf8")
  for (const match of text.matchAll(forbidden)) failures.push(`${relative(process.cwd(), path)}: ${match[0]}`)
}
if (failures.length) {
  console.error("Color gate failed; use HQ semantic tokens instead:\n" + failures.join("\n"))
  process.exit(1)
}
console.log(`Color gate passed (${targets.length} files scanned)`)
