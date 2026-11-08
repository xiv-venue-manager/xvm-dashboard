/**
 * Replaces the "Discord user <id>" placeholder names in a mapped people file with the names Discord gives
 * those ids, from the JSON frogge-names.sh prints. A name Discord could not return stays a placeholder.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/apply-discord-names.ts <dir-with-people-mapped.json> <names.json>
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { applyDiscordNames, type DiscordName, type NamedPeople } from "../lib/migration/discord-names"

const [dir, namesFile] = process.argv.slice(2)
if (!dir || !namesFile) {
  console.error("Usage: npx tsx scripts/apply-discord-names.ts <dir> <names.json>")
  process.exit(1)
}

const path = join(dir, "people-mapped.json")
const { file, named, unresolved } = applyDiscordNames(
  JSON.parse(readFileSync(path, "utf8")) as NamedPeople,
  JSON.parse(readFileSync(namesFile, "utf8")) as Record<string, DiscordName>,
)
writeFileSync(path, JSON.stringify(file, null, 2))
console.log(`named: ${named}`)
console.log(`still placeholders: ${unresolved.length}`)
