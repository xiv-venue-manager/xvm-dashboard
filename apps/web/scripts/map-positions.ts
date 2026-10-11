/**
 * Maps a positions export into the rows xvm-api's positions, memberships and membership_positions
 * need. Reads JSON files and never touches Prisma or xvm-api. Run map-people.ts first: only
 * memberships whose person it loaded are mapped.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/positions.sql > positions-export.json
 *   npx tsx scripts/map-positions.ts positions-export.json people-mapped.json positions-mapped.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapPositions, type PositionsExport } from "../lib/migration/positions"

const [input, peopleFile, output] = process.argv.slice(2)
if (!input || !peopleFile || !output) {
  console.error("Usage: npx tsx scripts/map-positions.ts <positions-export.json> <people-mapped.json> <out.json>")
  process.exit(1)
}

const source = JSON.parse(readFileSync(input, "utf8")) as PositionsExport
const people = JSON.parse(readFileSync(peopleFile, "utf8")) as { people: { key: string }[] }
const result = mapPositions(source, new Set(people.people.map((p) => p.key)))
writeFileSync(output, JSON.stringify(result, null, 2))

const tiers = (tier: string) => result.memberships.filter((m) => m.tier === tier).length
console.log(`positions:            ${result.positions.length} of ${source.roles.length}`)
console.log(`memberships:          ${result.memberships.length} of ${source.memberships.length} (${tiers("owner")} owners, ${tiers("manager")} managers, ${tiers("staff")} staff)`)
console.log(`membership positions: ${result.membershipPositions.length}`)
console.log(`skipped:              ${result.skipped.length}`)
console.log(`warnings:             ${result.warnings.length}`)
const reasons = new Map<string, number>()
for (const s of result.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1)
for (const [reason, count] of reasons) console.log(`  skipped ${count}: ${reason}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
