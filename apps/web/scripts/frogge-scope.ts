/**
 * Picks the Frogge servers that become XVM venues, by rule: a server with real venue data (see SCOPE_TABLES in
 * lib/migration/frogge-scope.ts) is loaded, one with only defaults, welcome posts or a single profile or template is not.
 * Reads the per-server row counts that frogge-guild-activity.sh writes. Re-run it in the window, because servers keep
 * gaining data.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/frogge-scope.ts <frogge-guild-activity.txt> <frogge-owners-output.csv> <current-ids.txt> <out-ids.txt>
 * current-ids.txt is the comma separated list now in the export scripts. A server already on it is kept even if the rule no longer
 * selects it (it may hold settings the activity counts cannot see, such as an audit log channel), and is listed for a person to review.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { frogScope, parseActivity, renderScope } from "../lib/migration/frogge-scope"

const [activityFile, ownersFile, currentFile, outFile] = process.argv.slice(2)
if (!activityFile || !ownersFile || !currentFile || !outFile) {
  console.error("Usage: npx tsx scripts/frogge-scope.ts <activity.txt> <owners.csv> <current-ids.txt> <out-ids.txt>")
  process.exit(2)
}
const owners: Record<string, string> = {}
for (const line of readFileSync(ownersFile, "utf8").split("\n").slice(1)) {
  const cells = line.split(",")
  if (cells.length >= 4 && cells[0])
    owners[cells[0].replace(/"/g, "")] = cells[cells.length - 1].replace(/"/g, "").trim()
}
const current = new Set(
  readFileSync(currentFile, "utf8")
    .split(/[,\s]+/)
    .filter(Boolean)
)
const result = frogScope(parseActivity(readFileSync(activityFile, "utf8")), owners, current)
const ids = [...result.include.map((s) => s.guildId), ...result.dropped]
writeFileSync(outFile, ids.join(","))
console.log(renderScope(result))
