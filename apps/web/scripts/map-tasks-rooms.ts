/**
 * Maps a tasks and rooms export into the rows xvm-api's task_categories, tasks and rooms need.
 * Reads JSON files and never touches Prisma or xvm-api. Run map-people.ts and map-positions.ts
 * first: a task or room only links to a person, membership and position they loaded, and a room's
 * owner is found through their Discord id.
 *
 * The rooms table has no Prisma model any more, so the export reads it directly.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/tasks-rooms.sql > tasks-rooms-export.json
 *   npx tsx scripts/map-tasks-rooms.ts tasks-rooms-export.json people-mapped.json positions-mapped.json tasks-rooms-mapped.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapTasksRooms, type TasksRoomsExport } from "../lib/migration/tasks-rooms"

const [input, peopleFile, positionsFile, output] = process.argv.slice(2)
if (!input || !peopleFile || !positionsFile || !output) {
  console.error("Usage: npx tsx scripts/map-tasks-rooms.ts <export.json> <people-mapped.json> <positions-mapped.json> <out.json>")
  process.exit(1)
}

const read = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T
const source = read<TasksRoomsExport>(input)
const people = read<{ people: { key: string }[]; discordAccounts: { person_key: string; external_id: string }[] }>(peopleFile)
const positions = read<{ positions: { key: string; venue_key: string }[]; memberships: { key: string; venue_key: string; person_key: string }[] }>(positionsFile)

const result = mapTasksRooms(source, {
  personKeys: new Set(people.people.map((p) => p.key)),
  memberships: new Map(positions.memberships.map((m) => [m.key, { venue: m.venue_key, person: m.person_key }])),
  positions: new Map(positions.positions.map((p) => [p.key, p.venue_key])),
  discordPeople: new Map(people.discordAccounts.map((a) => [a.external_id, a.person_key])),
})
writeFileSync(output, JSON.stringify(result, null, 2))

const byStatus = new Map<string, number>()
for (const t of result.tasks) {
  const state = t.cancelled_at ? "cancelled" : t.completed_at ? "completed" : t.started_at ? "in progress" : "pending"
  byStatus.set(state, (byStatus.get(state) ?? 0) + 1)
}
console.log(`tasks:      ${result.tasks.length} of ${source.tasks.length} over ${new Set(result.tasks.map((t) => t.venue_key)).size} venues (${[...byStatus].map(([k, v]) => `${v} ${k}`).join(", ")})`)
console.log(`categories: ${result.taskCategories.length}`)
console.log(`rooms:      ${result.rooms.length} of ${source.rooms.length} over ${new Set(result.rooms.map((r) => r.venue_key)).size} venues`)
console.log(`skipped:    ${result.skipped.length}`)
for (const s of result.skipped) console.log(`  skipped ${s.key}: ${s.reason}`)
console.log(`warnings:   ${result.warnings.length}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
