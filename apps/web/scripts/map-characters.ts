/**
 * Maps a characters export into the rows xvm-api's person_characters need. Reads JSON files and
 * never touches Prisma or xvm-api. Run map-people.ts first: only characters whose person it
 * loaded are mapped.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/characters.sql > characters-export.json
 *   npx tsx scripts/map-characters.ts characters-export.json people-mapped.json characters-mapped.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapCharacters, type CharacterExport } from "../lib/migration/characters"

const [input, peopleFile, output] = process.argv.slice(2)
if (!input || !peopleFile || !output) {
  console.error("Usage: npx tsx scripts/map-characters.ts <characters-export.json> <people-mapped.json> <out.json>")
  process.exit(1)
}

const source = JSON.parse(readFileSync(input, "utf8")) as CharacterExport
const people = JSON.parse(readFileSync(peopleFile, "utf8")) as { people: { key: string }[] }
const result = mapCharacters(source, new Set(people.people.map((p) => p.key)))
writeFileSync(output, JSON.stringify(result, null, 2))

console.log(`characters: ${result.characters.length} of ${source.characters.length}`)
console.log(`people with characters: ${new Set(result.characters.map((c) => c.person_key)).size}`)
console.log(`skipped:    ${result.skipped.length}`)
console.log(`warnings:   ${result.warnings.length}`)
for (const s of result.skipped) console.log(`  skipped ${s.key}: ${s.reason}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
