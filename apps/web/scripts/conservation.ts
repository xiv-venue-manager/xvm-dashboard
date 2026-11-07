/**
 * Accounts for every row from prod to the loader's input, and exits 1 if any row is lost without a recorded reason.
 * Reads files only. Run it after prepare-load.ts, in the rehearsal and again in the window.
 *
 * Usage (from apps/web):
 *   psql ... -f scripts/export/table-counts.sql > table-counts.json     (read-only; take another after the exports for a live database)
 *   npx tsx scripts/conservation.ts --counts table-counts.json --exports <export dir> --mapped <mapped dir> \
 *     [--counts-after table-counts-after.json] [--accepted accepted.json]
 *
 * accepted.json lists rows a person has reviewed and accepted losing, as the most allowed per line, for example
 *   { "finance:bad-amount": 2, "events.events:cascade": 0 }
 * so a later run that loses more than was reviewed fails. Rows lost because their venue was skipped for bad data are counted
 * per list, as "<file>.<array>:venue-data".
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { buildReport, renderReport, type Counts, type ExportFiles } from "../lib/migration/conservation"
import { LOAD_ARRAYS, type MappedFiles } from "../lib/migration/prepare-load"

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const counts = flag("counts")
const exportsDir = flag("exports")
const mappedDir = flag("mapped")
if (!counts || !exportsDir || !mappedDir) {
  console.error(
    "Usage: npx tsx scripts/conservation.ts --counts <table-counts.json> --exports <dir> --mapped <dir> [--counts-after <file>] [--accepted <file>]"
  )
  process.exit(2)
}

const read = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T
const readIf = (file: string) => (existsSync(file) ? read<Record<string, unknown>>(file) : undefined)

const EXPORTS = [
  "people",
  "venues",
  "positions",
  "services",
  "characters",
  "events",
  "shifts",
  "finance",
  "patrons",
  "follows-feedback",
  "tasks-rooms",
  "hours",
  "settings",
]
const exports: ExportFiles = {}
for (const name of EXPORTS) exports[name] = readIf(join(exportsDir, `${name}.json`))

const mapped: MappedFiles = {}
const prepared: MappedFiles = {}
for (const name of [...Object.keys(LOAD_ARRAYS), "characters", "people"]) {
  const m = readIf(join(mappedDir, `${name}-mapped.json`))
  if (m) mapped[name] = m
  const p = readIf(join(mappedDir, `${name}-prepared.json`))
  if (p) prepared[name] = p
}

const afterFile = flag("counts-after")
const acceptedFile = flag("accepted")
const report = buildReport({
  counts: read<Counts>(counts),
  countsAfter: afterFile ? read<Counts>(afterFile) : undefined,
  exports,
  mapped,
  prepared,
  accepted: acceptedFile ? read<Record<string, number>>(acceptedFile) : undefined,
})
console.log(renderReport(report))
process.exit(report.problems.length === 0 ? 0 : 1)
