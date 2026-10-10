/**
 * Maps a patrons export into the rows xvm-api's patrons and patron_logs need. Reads JSON files and
 * never touches Prisma or xvm-api. Run map-people.ts and map-events.ts first: a row only links to a
 * person and event they loaded.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/patrons.sql > patrons-export.json
 *   npx tsx scripts/map-patrons.ts patrons-export.json people-mapped.json events-mapped.json patrons-mapped.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapPatrons, type PatronsExport } from "../lib/migration/patrons"

const [input, peopleFile, eventsFile, output] = process.argv.slice(2)
if (!input || !peopleFile || !eventsFile || !output) {
  console.error("Usage: npx tsx scripts/map-patrons.ts <patrons-export.json> <people-mapped.json> <events-mapped.json> <out.json>")
  process.exit(1)
}

const read = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T
const source = read<PatronsExport>(input)
const people = read<{ people: { key: string }[] }>(peopleFile)
const events = read<{ events: { key: string }[] }>(eventsFile)

const result = mapPatrons(source, {
  personKeys: new Set(people.people.map((p) => p.key)),
  eventKeys: new Set(events.events.map((e) => e.key)),
})
writeFileSync(output, JSON.stringify(result, null, 2))

const reasons = new Map<string, number>()
for (const s of result.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1)
const net = (action: string) => result.logs.filter((l) => l.action === action).reduce((total, l) => total + (l.count_change ?? 0), 0)
console.log(`patrons:  ${result.patrons.length} of ${source.patrons.length} (${result.patrons.filter((p) => p.banned_at).length} banned)`)
console.log(`logs:     ${result.logs.length} of ${source.logs.length} (entries ${net("enter")}, exits ${net("leave")}, ${result.logs.filter((l) => l.event_key).length} with an event)`)
console.log(`skipped:  ${result.skipped.length}`)
for (const [reason, count] of reasons) console.log(`  skipped ${count}: ${reason}`)
console.log(`warnings: ${result.warnings.length}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
