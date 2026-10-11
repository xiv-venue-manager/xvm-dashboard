/**
 * Maps a services export into the rows xvm-api's service_categories, services, service_positions
 * and service_inventories need. Reads JSON files and never touches Prisma or xvm-api. Run
 * map-positions.ts first: a grant is only mapped to a position it loaded.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/services.sql > services-export.json
 *   npx tsx scripts/map-services.ts services-export.json positions-mapped.json services-mapped.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapServices, type ServicesExport } from "../lib/migration/services"

const [input, positionsFile, output] = process.argv.slice(2)
if (!input || !positionsFile || !output) {
  console.error("Usage: npx tsx scripts/map-services.ts <services-export.json> <positions-mapped.json> <out.json>")
  process.exit(1)
}

const source = JSON.parse(readFileSync(input, "utf8")) as ServicesExport
const positions = JSON.parse(readFileSync(positionsFile, "utf8")) as { positions: { key: string; venue_key: string }[] }
const result = mapServices(source, new Map(positions.positions.map((p) => [p.key, p.venue_key])))
writeFileSync(output, JSON.stringify(result, null, 2))

console.log(`services:          ${result.services.length} of ${source.services.length}`)
console.log(`categories:        ${result.categories.length}`)
console.log(`service positions: ${result.servicePositions.length}`)
console.log(`inventories:       ${result.inventories.length}`)
console.log(`skipped:           ${result.skipped.length}`)
console.log(`warnings:          ${result.warnings.length}`)
for (const s of result.skipped) console.log(`  skipped ${s.key}: ${s.reason}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
