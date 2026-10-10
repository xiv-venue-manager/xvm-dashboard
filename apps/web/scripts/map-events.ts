/**
 * Maps an events export into the rows xvm-api's recurrence_rules and events need, plus the
 * attendance and revenue totals that have no home. Reads JSON files and never touches Prisma or
 * xvm-api. Run map-people.ts first: a creator is only linked to a person it loaded.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/events.sql > events-export.json
 *   npx tsx scripts/map-events.ts events-export.json people-mapped.json events-mapped.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapEvents, type EventsExport } from "../lib/migration/events"

const [input, peopleFile, output] = process.argv.slice(2)
if (!input || !peopleFile || !output) {
  console.error("Usage: npx tsx scripts/map-events.ts <events-export.json> <people-mapped.json> <out.json>")
  process.exit(1)
}

const source = JSON.parse(readFileSync(input, "utf8")) as EventsExport
const people = JSON.parse(readFileSync(peopleFile, "utf8")) as { people: { key: string }[] }
const result = mapEvents(source, new Set(people.people.map((p) => p.key)))
writeFileSync(output, JSON.stringify(result, null, 2))

const intervals = new Map<string, number>()
for (const r of result.rules) intervals.set(r.interval, (intervals.get(r.interval) ?? 0) + 1)
console.log(`events:   ${result.events.length} of ${source.events.length}`)
console.log(`rules:    ${result.rules.length} (${[...intervals].map(([k, v]) => `${v} ${k}`).join(", ")})`)
console.log(`in series: ${result.events.filter((e) => e.rule_key).length}`)
console.log(`totals:   ${result.totals.length} events with attendance or revenue`)
console.log(`skipped:  ${result.skipped.length}`)
console.log(`warnings: ${result.warnings.length}`)
for (const s of result.skipped) console.log(`  skipped ${s.key}: ${s.reason}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
