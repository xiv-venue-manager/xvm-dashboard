/**
 * Maps Frogge's reaction roles, leveling and VIP into frogge-features-mapped.json, the file the loader reads
 * after the staffing merge. Reads the export and the staffing merge's output directory, adds a placeholder
 * person for any Discord user not yet there, and never touches a database. The output directory is the
 * staffing output with the new file added and people-mapped.json updated.
 *
 * Usage (from apps/web):
 *   bash frogge-export-features.sh > frogge-features.json
 *   npx tsx scripts/map-frogge-features.ts frogge-features.json <staffing-out-dir> <out-dir>
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { mapFroggeFeatures, type FroggeFeatureExport, type PeopleFile } from "../lib/migration/frogge-features"

const [input, stagingDir, outDir] = process.argv.slice(2)
if (!input || !stagingDir || !outDir) {
  console.error("Usage: npx tsx scripts/map-frogge-features.ts <frogge-features.json> <staffing-out-dir> <out-dir>")
  process.exit(1)
}

const read = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T
const source = read<FroggeFeatureExport>(input)
const peopleFile = read<PeopleFile & Record<string, unknown>>(join(stagingDir, "people-mapped.json"))
const frogge = read<{
  matchedVenues: { guild_id: string; key: string }[]
  newVenues: { guild_id: string; key: string }[]
}>(join(stagingDir, "frogge-report.json"))
const venueKeyByGuild = Object.fromEntries(
  [...frogge.matchedVenues, ...frogge.newVenues].map((v) => [v.guild_id, v.key])
)

const createdVenues = new Set(frogge.newVenues.map((v) => v.key))
const { people, features, report } = mapFroggeFeatures(
  source,
  { venueKeyByGuild, createdVenues, now: new Date().toISOString() },
  peopleFile
)

mkdirSync(outDir, { recursive: true })
for (const name of readdirSync(stagingDir)) {
  if (name.endsWith(".json") && name !== "people-mapped.json" && name !== "ledger.json")
    copyFileSync(join(stagingDir, name), join(outDir, name))
}
writeFileSync(join(outDir, "people-mapped.json"), JSON.stringify({ ...peopleFile, ...people }, null, 2))
writeFileSync(join(outDir, "frogge-features-mapped.json"), JSON.stringify(features, null, 2))
writeFileSync(join(outDir, "frogge-features-report.json"), JSON.stringify(report, null, 2))

console.log(`servers that are venues: ${Object.keys(venueKeyByGuild).length}`)
for (const [what, n] of Object.entries(report.counts)) console.log(`  ${what}: ${n}`)
console.log(`dropped: ${report.dropped.length}`)
const reasons = new Map<string, number>()
for (const d of report.dropped) reasons.set(`${d.what}: ${d.reason}`, (reasons.get(`${d.what}: ${d.reason}`) ?? 0) + 1)
for (const [reason, n] of reasons) console.log(`  dropped ${n}: ${reason}`)
for (const note of report.notes) console.log(`note: ${note}`)
