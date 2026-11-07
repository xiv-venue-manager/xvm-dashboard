/**
 * Accounts for every row in the two Frogge exports against what the Frogge mappers produced. Exits 1 on a row lost without a
 * recorded reason or an array nobody has decided. Reads files only.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/frogge-conservation.ts <Frogge export dir> <final dir> [--accepted accepted.json]
 * accepted.json keys for this check are "frogge:<array>", for example { "frogge:positions": 6 }.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { checkFrogge, renderFrogge } from "../lib/migration/frogge-conservation"

const args = process.argv.slice(2)
const [exportsDir, finalDir] = args
const acceptedFile = args.includes("--accepted") ? args[args.indexOf("--accepted") + 1] : undefined
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
console.log(renderFrogge(result))
process.exit(result.problems.length ? 1 : 0)
