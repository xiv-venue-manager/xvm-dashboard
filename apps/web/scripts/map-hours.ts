/**
 * Maps an opening hours export into the venue_hours rows (each with its recurrence rule) xvm-api
 * needs. Reads a JSON export and never touches Prisma or xvm-api. Entries of a venue whose hours
 * sync from ffxivvenues.com are left out, because xvm-api's own ffxivvenues source repopulates them.
 *
 * Times in the old entries are in UTC (Server Time), so every rule is in UTC.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/hours.sql > hours-export.json
 *   npx tsx scripts/map-hours.ts hours-export.json hours-mapped.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapHours, type HoursExport } from "../lib/migration/hours"

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error("Usage: npx tsx scripts/map-hours.ts <hours-export.json> <out.json>")
  process.exit(1)
}

const source = JSON.parse(readFileSync(input, "utf8")) as HoursExport
const result = mapHours(source)
writeFileSync(output, JSON.stringify(result, null, 2))

const intervals = new Map<string, number>()
for (const h of result.hours) intervals.set(h.rule.interval, (intervals.get(h.rule.interval) ?? 0) + 1)
console.log(`hours:   ${result.hours.length} of ${source.entries.length} over ${new Set(result.hours.map((h) => h.venue_key)).size} venues (${[...intervals].map(([k, v]) => `${v} ${k}`).join(", ")})`)
console.log(`ffxivvenues venues left to the sync: ${source.syncedVenues.length}`)
const reasons = new Map<string, number>()
for (const s of result.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1)
console.log(`skipped: ${result.skipped.length}`)
for (const [reason, count] of reasons) console.log(`  skipped ${count}: ${reason}`)
console.log(`warnings: ${result.warnings.length}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
