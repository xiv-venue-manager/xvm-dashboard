/**
 * Merges Frogge's staffing and events into the mapped files the loader reads. A Frogge server that
 * matches one of our venues adds to it, and every other server becomes a new venue. Reads the
 * export, the prepared Prisma files and the Discord server owners, and never touches a database.
 *
 * The venue match decides which servers merge. With no match file the names are compared and the
 * suggestion is used and written to <out>/frogge-venue-match.json. Check it, edit it, and pass it
 * back as the last argument when a suggestion is wrong.
 *
 * Usage (from apps/web):
 *   bash frogge-export-staffing.sh > frogge-staffing.json
 *   npx tsx scripts/map-frogge-staffing.ts frogge-staffing.json <load-dir> owners.json <out-dir> [venue-match.json]
 *
 * owners.json maps a server id to its owner's Discord id: { "<guild id>": "<discord user id>" }.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { mapFroggeStaffing, suggestVenueMatches, type BaseFiles, type FroggeExport } from "../lib/migration/frogge-staffing"

const [input, loadDir, ownersFile, outDir, matchFile] = process.argv.slice(2)
if (!input || !loadDir || !ownersFile || !outDir) {
  console.error("Usage: npx tsx scripts/map-frogge-staffing.ts <frogge-export.json> <load-dir> <owners.json> <out-dir> [venue-match.json]")
  process.exit(1)
}

const read = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T
const source = read<FroggeExport>(input)
const owners = read<Record<string, string>>(ownersFile)
const merged = ["people", "venues", "positions", "events", "shifts"] as const
const base = Object.fromEntries(merged.map((name) => [name, read(join(loadDir, `${name}-mapped.json`))])) as unknown as BaseFiles

const suggested = suggestVenueMatches(source.guilds, base.venues.venues as { key: string; name: string }[])
const venueMatch: Record<string, string | null> = matchFile ? { ...suggested, ...read<Record<string, string | null>>(matchFile) } : suggested

const { files, report } = mapFroggeStaffing(source, { owners, venueMatch, now: new Date().toISOString() }, base)

mkdirSync(outDir, { recursive: true })
for (const name of readdirSync(loadDir)) {
  if (name.endsWith("-mapped.json") && !merged.some((m) => name === `${m}-mapped.json`)) copyFileSync(join(loadDir, name), join(outDir, name))
}
for (const name of merged) writeFileSync(join(outDir, `${name}-mapped.json`), JSON.stringify(files[name], null, 2))
writeFileSync(join(outDir, "frogge-report.json"), JSON.stringify(report, null, 2))
writeFileSync(join(outDir, "frogge-venue-match.json"), JSON.stringify(venueMatch, null, 2))

console.log(`servers: ${source.guilds.length} (${report.matchedVenues.length} merge into our venues, ${report.newVenues.length} become new venues)`)
for (const m of report.matchedVenues) console.log(`  merges: ${source.guilds.find((g) => g.guild_id === m.guild_id)?.name} -> ${m.key}${matchFile ? "" : " (suggested by name)"}`)
for (const [what, n] of Object.entries(report.counts)) console.log(`  ${what}: ${n}`)
console.log(`hire dates moved earlier: ${report.startDateAmendments.length}`)
console.log(`new venues on UTC (owner to check): ${report.utcVenues.length}`)
console.log(`people without a name (placeholders): ${report.placeholderPeople.length}`)
const reasons = new Map<string, number>()
for (const d of report.dropped) reasons.set(`${d.what}: ${d.reason}`, (reasons.get(`${d.what}: ${d.reason}`) ?? 0) + 1)
console.log(`dropped: ${report.dropped.length}`)
for (const [reason, n] of reasons) console.log(`  dropped ${n}: ${reason}`)
