/**
 * Maps a people export into the rows xvm-api's people and person_accounts need. Reads a JSON
 * export and never touches Prisma or xvm-api.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/people.sql > people-export.json
 *   npx tsx scripts/map-people.ts people-export.json people-mapped.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapPeople, type PeopleExport } from "../lib/migration/people"

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error("Usage: npx tsx scripts/map-people.ts <export.json> <mapped.json>")
  process.exit(1)
}

const source = JSON.parse(readFileSync(input, "utf8")) as PeopleExport
const result = mapPeople(source)
writeFileSync(output, JSON.stringify(result, null, 2))

console.log(`people:           ${result.people.length} (${result.people.filter((p) => p.kind === "payee").length} payees)`)
console.log(`discord accounts: ${result.discordAccounts.length}`)
console.log(`email accounts:   ${result.emailAccounts.length}`)
console.log(`skipped:          ${result.skipped.length}`)
console.log(`warnings:         ${result.warnings.length}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
