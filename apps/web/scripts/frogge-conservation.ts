/**
 * Accounts for every row in the two Frogge exports against what the Frogge mappers produced. Exits 1 on a row lost without a
 * recorded reason or an array nobody has decided. Reads files only.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/frogge-conservation.ts <Frogge export dir> <final dir> [--counts frogge-table-counts.json] [--accepted accepted.json]
 * The counts file is one read-only query on the Frogge database (scripts/export/frogge-table-counts.sql) and checks that every
 * Frogge table has a decision.
 * accepted.json keys for this check are "frogge:<array>", for example { "frogge:positions": 6 }.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { checkFrogge, checkFroggeTables, renderFrogge, type FroggeCounts } from "../lib/migration/frogge-conservation"

const args = process.argv.slice(2)
const [exportsDir, finalDir] = args
const flag = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined)
const acceptedFile = flag("accepted")
const countsFile = flag("counts")
if (!exportsDir || !finalDir) {
  console.error(
    "Usage: npx tsx scripts/frogge-conservation.ts <Frogge export dir> <final dir> [--accepted accepted.json]"
  )
  process.exit(2)
}
const readIf = (file: string) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined)
const result = checkFrogge(
  {
    exports: {
      staffing: readIf(join(exportsDir, "frogge-staffing.json")),
      features: readIf(join(exportsDir, "frogge-features.json")),
    },
    reports: {
      staffing: readIf(join(finalDir, "frogge-report.json")),
      features: readIf(join(finalDir, "frogge-features-report.json")),
      tools: readIf(join(finalDir, "frogge-tools-report.json")),
    },
    mapped: {
      features: readIf(join(finalDir, "frogge-features-mapped.json")),
      tools: readIf(join(finalDir, "frogge-tools-mapped.json")),
    },
  },
  acceptedFile ? readIf(acceptedFile) : {}
)
const tables = countsFile
  ? checkFroggeTables(readIf(countsFile) as FroggeCounts, {
      staffing: readIf(join(exportsDir, "frogge-staffing.json")),
      features: readIf(join(exportsDir, "frogge-features.json")),
    })
  : undefined
const merged = {
  lines: [...(tables?.lines ?? []), ...result.lines],
  problems: [...(tables?.problems ?? []), ...result.problems],
}
if (!tables) merged.problems.push("no --counts file, so nobody checked that every Frogge table has a decision")
console.log(renderFrogge(merged))
process.exit(merged.problems.length ? 1 : 0)
