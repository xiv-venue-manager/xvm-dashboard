/**
 * Maps a shifts export into the rows xvm-api's recurrence_rules, shifts and shift_audit_entries
 * need. Reads JSON files and never touches Prisma or xvm-api. Run map-people.ts, map-positions.ts
 * and map-events.ts first: a shift only links to a person, membership, position and event they
 * loaded.
 *
 * A series needs a timezone and Prisma shifts have none, so each venue takes the most common
 * timezone of its events, else UTC. That is the proposed venue timezone rule, not a decided one.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/shifts.sql > shifts-export.json
 *   npx tsx scripts/map-shifts.ts shifts-export.json people-mapped.json positions-mapped.json \
 *     events-mapped.json events-export.json shifts-mapped.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapShifts, type ShiftsExport } from "../lib/migration/shifts"

const [input, peopleFile, positionsFile, eventsFile, eventsExportFile, output] = process.argv.slice(2)
if (!input || !peopleFile || !positionsFile || !eventsFile || !eventsExportFile || !output) {
  console.error("Usage: npx tsx scripts/map-shifts.ts <shifts-export> <people-mapped> <positions-mapped> <events-mapped> <events-export> <out>")
  process.exit(1)
}

const read = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T
const source = read<ShiftsExport>(input)
const people = read<{ people: { key: string }[] }>(peopleFile)
const positions = read<{ positions: { key: string; venue_key: string }[]; memberships: { key: string; venue_key: string }[] }>(positionsFile)
const events = read<{ events: { key: string }[] }>(eventsFile)
const rawEvents = read<{ events: { venueId: string; timezone: string }[] }>(eventsExportFile)

const tzCounts = new Map<string, Map<string, number>>()
for (const e of rawEvents.events) {
  const counts = tzCounts.get(e.venueId) ?? new Map<string, number>()
  counts.set(e.timezone, (counts.get(e.timezone) ?? 0) + 1)
  tzCounts.set(e.venueId, counts)
}
const venueTimezones = new Map<string, string>()
for (const [venue, counts] of tzCounts) {
  venueTimezones.set(venue, [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0])
}

const result = mapShifts(source, {
  personKeys: new Set(people.people.map((p) => p.key)),
  memberships: new Map(positions.memberships.map((m) => [m.key, m.venue_key])),
  positions: new Map(positions.positions.map((p) => [p.key, p.venue_key])),
  eventKeys: new Set(events.events.map((e) => e.key)),
  venueTimezones,
  now: new Date(),
})
writeFileSync(output, JSON.stringify(result, null, 2))

const reasons = new Map<string, number>()
for (const s of result.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1)
console.log(`shifts:  ${result.shifts.length} of ${source.shifts.length}`)
console.log(`rules:   ${result.rules.length}`)
console.log(`in series: ${result.shifts.filter((s) => s.rule_key).length}`)
console.log(`audits:  ${result.audits.length} of ${source.audits.length}`)
console.log(`skipped: ${result.skipped.length}`)
for (const [reason, count] of reasons) console.log(`  skipped ${count}: ${reason}`)
console.log(`warnings: ${result.warnings.length}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
