/**
 * Maps a shifts export into the rows xvm-api's event_positions, event_shifts, shifts and
 * shift_audit_entries need. Reads JSON files and never touches Prisma or xvm-api. Run
 * map-people.ts, map-positions.ts and map-events.ts first: a shift only links to a person,
 * membership, position and event they loaded.
 *
 * A shift on an event and a position becomes a seat on an event shift. Open slots only add to
 * that event shift's capacity. A worked shift with no event or position is kept as a walk-in.
 * Recurrence is dropped: the series' shifts were already separate rows.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/shifts.sql > shifts-export.json
 *   npx tsx scripts/map-shifts.ts shifts-export.json people-mapped.json positions-mapped.json \
 *     events-mapped.json shifts-mapped.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapShifts, type ShiftsExport } from "../lib/migration/shifts"

const [input, peopleFile, positionsFile, eventsFile, output] = process.argv.slice(2)
if (!input || !peopleFile || !positionsFile || !eventsFile || !output) {
  console.error("Usage: npx tsx scripts/map-shifts.ts <shifts-export> <people-mapped> <positions-mapped> <events-mapped> <out>")
  process.exit(1)
}

const read = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T
const source = read<ShiftsExport>(input)
const people = read<{ people: { key: string }[] }>(peopleFile)
const positions = read<{ positions: { key: string; venue_key: string }[]; memberships: { key: string; venue_key: string }[] }>(positionsFile)
const events = read<{ events: { key: string }[] }>(eventsFile)
const result = mapShifts(source, {
  personKeys: new Set(people.people.map((p) => p.key)),
  memberships: new Map(positions.memberships.map((m) => [m.key, m.venue_key])),
  positions: new Map(positions.positions.map((p) => [p.key, p.venue_key])),
  eventKeys: new Set(events.events.map((e) => e.key)),
  now: new Date(),
})
writeFileSync(output, JSON.stringify(result, null, 2))

const reasons = new Map<string, number>()
for (const s of result.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1)
console.log(`shifts:  ${result.shifts.length} of ${source.shifts.length}`)
console.log(`event positions: ${result.event_positions.length}`)
console.log(`event shifts:    ${result.event_shifts.length}`)
console.log(`walk-ins:        ${result.shifts.filter((s) => s.event_shift_key === null).length}`)
console.log(`folded open slots: ${result.folded_open_slots}`)
console.log(`audits:  ${result.audits.length} of ${source.audits.length}`)
console.log(`skipped: ${result.skipped.length}`)
for (const [reason, count] of reasons) console.log(`  skipped ${count}: ${reason}`)
console.log(`warnings: ${result.warnings.length}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
