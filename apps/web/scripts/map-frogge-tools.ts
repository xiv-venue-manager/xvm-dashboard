/**
 * Maps Frogge's forms, giveaways and raffles, sticky messages, streams, quote board, embeds, auto-reactors,
 * event and message templates and rooms into frogge-tools-mapped.json, the file the loader reads after the
 * features file. Reads the export and the output directory of map-frogge-features.ts, adds a placeholder
 * person for any Discord user not yet there, and never touches a database. It also turns Frogge's weekly event
 * rules into xvm-api series and attaches the events they made, rewriting events-mapped.json.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/map-frogge-tools.ts frogge-features.json <features-out-dir> <out-dir>
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { PeopleFile } from "../lib/migration/frogge-features"
import { attachFroggeSeries, type FroggeSeriesExport, type SeriesFiles } from "../lib/migration/frogge-series"
import { mapFroggeTools, type FroggeToolsExport } from "../lib/migration/frogge-tools"

const [input, stagingDir, outDir] = process.argv.slice(2)
if (!input || !stagingDir || !outDir) {
  console.error("Usage: npx tsx scripts/map-frogge-tools.ts <frogge-features.json> <features-out-dir> <out-dir>")
  process.exit(1)
}

const read = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T
const source = read<FroggeToolsExport>(input)
const peopleFile = read<PeopleFile & Record<string, unknown>>(join(stagingDir, "people-mapped.json"))
const frogge = read<{ matchedVenues: { guild_id: string; key: string }[]; newVenues: { guild_id: string; key: string }[] }>(
  join(stagingDir, "frogge-report.json"),
)
const venueKeyByGuild = Object.fromEntries([...frogge.matchedVenues, ...frogge.newVenues].map((v) => [v.guild_id, v.key]))

const { people, tools, report } = mapFroggeTools(source, { venueKeyByGuild, now: new Date().toISOString() }, peopleFile)

mkdirSync(outDir, { recursive: true })
for (const name of readdirSync(stagingDir)) {
  if (name.endsWith(".json") && name !== "people-mapped.json" && name !== "ledger.json") copyFileSync(join(stagingDir, name), join(outDir, name))
}
const eventsFile = read<SeriesFiles & Record<string, unknown>>(join(stagingDir, "events-mapped.json"))
const series = attachFroggeSeries(read<FroggeSeriesExport>(input), { venueKeyByGuild }, eventsFile)
writeFileSync(join(outDir, "events-mapped.json"), JSON.stringify({ ...eventsFile, ...series.files }, null, 2))
for (const [what, n] of Object.entries(series.report.counts)) report.counts[what] = (report.counts[what] ?? 0) + n
report.dropped.push(...series.report.dropped)
report.notes.push(...series.report.notes)

writeFileSync(join(outDir, "people-mapped.json"), JSON.stringify({ ...peopleFile, ...people }, null, 2))
writeFileSync(join(outDir, "frogge-tools-mapped.json"), JSON.stringify(tools, null, 2))
writeFileSync(join(outDir, "frogge-tools-report.json"), JSON.stringify(report, null, 2))

console.log(`servers that are venues: ${Object.keys(venueKeyByGuild).length}`)
for (const [what, n] of Object.entries(report.counts)) console.log(`  ${what}: ${n}`)
console.log(`dropped: ${report.dropped.length}`)
const reasons = new Map<string, number>()
for (const d of report.dropped) reasons.set(`${d.what}: ${d.reason}`, (reasons.get(`${d.what}: ${d.reason}`) ?? 0) + 1)
for (const [reason, n] of reasons) console.log(`  dropped ${n}: ${reason}`)
for (const note of report.notes) console.log(`note: ${note}`)
