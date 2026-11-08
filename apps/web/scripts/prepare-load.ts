/**
 * Drops every mapped row that must not load (venues left out by map-venues.ts, and their children) and clears
 * shift links to payroll entries that were skipped. Reads <name>-mapped.json files from one directory and
 * writes <name>-prepared.json next to them. Run every map-*.ts first, including map-venues.ts.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/prepare-load.ts <dir>
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { prepareLoad, type MappedFiles } from "../lib/migration/prepare-load"

const [dir] = process.argv.slice(2)
if (!dir) {
  console.error("Usage: npx tsx scripts/prepare-load.ts <dir holding the *-mapped.json files>")
  process.exit(1)
}

const NAMES = ["venues", "positions", "services", "events", "shifts", "finance", "patrons", "follows-feedback", "tasks-rooms", "hours", "settings"]
const input: MappedFiles = {}
for (const name of NAMES) {
  const file = join(dir, `${name}-mapped.json`)
  if (existsSync(file)) input[name] = JSON.parse(readFileSync(file, "utf8"))
}

const { files, report } = prepareLoad(input)
for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, `${name}-prepared.json`), JSON.stringify(content, null, 2))

console.log(`prepared ${Object.keys(files).length} files`)
for (const [where, n] of Object.entries(report.dropped)) console.log(`  dropped ${n} from ${where}`)
console.log(`  cleared ${report.clearedPayrollLinks} shift payroll links`)
