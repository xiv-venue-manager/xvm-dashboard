/**
 * Maps Frogge's Lodestone-verified characters and each server's verification settings. Reads the export and
 * the features merge's output directory, upgrades or adds rows in characters-mapped.json, extends the
 * discordSettings in frogge-features-mapped.json, and never touches a database. The output directory is the
 * features output with those two files updated.
 *
 * Usage (from apps/web):
 *   bash frogge-export-verification.sh > frogge-verification.json
 *   npx tsx scripts/map-frogge-verification.ts frogge-verification.json <features-out-dir> <out-dir>
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { mapFroggeVerification, type FroggeVerificationExport } from "../lib/migration/frogge-verification"

const [input, stagingDir, outDir] = process.argv.slice(2)
if (!input || !stagingDir || !outDir) {
  console.error("Usage: npx tsx scripts/map-frogge-verification.ts <frogge-verification.json> <features-out-dir> <out-dir>")
  process.exit(1)
}

type Row = Record<string, unknown>
const read = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T
const source = read<FroggeVerificationExport>(input)
const people = read<{ discordAccounts: Row[] }>(join(stagingDir, "people-mapped.json"))
const charactersFile = read<{ characters: Row[] } & Row>(join(stagingDir, "characters-mapped.json"))
const featuresFile = read<{ discordSettings: Row[] } & Row>(join(stagingDir, "frogge-features-mapped.json"))
const frogge = read<{
  matchedVenues: { guild_id: string; key: string }[]
  newVenues: { guild_id: string; key: string }[]
}>(join(stagingDir, "frogge-report.json"))

const venueKeyByGuild = Object.fromEntries([...frogge.matchedVenues, ...frogge.newVenues].map((v) => [v.guild_id, v.key]))
const personByDiscord = new Map(
  people.discordAccounts.map((a) => [a.external_id as string, a.person_key as string] as const)
)

const { characters, discordSettings, report } = mapFroggeVerification(
  source,
  { venueKeyByGuild, personByDiscord },
  charactersFile.characters,
  featuresFile.discordSettings
)

mkdirSync(outDir, { recursive: true })
for (const name of readdirSync(stagingDir)) {
  if (name.endsWith(".json") && !["characters-mapped.json", "frogge-features-mapped.json", "ledger.json"].includes(name))
    copyFileSync(join(stagingDir, name), join(outDir, name))
}
writeFileSync(join(outDir, "characters-mapped.json"), JSON.stringify({ ...charactersFile, characters }, null, 2))
writeFileSync(join(outDir, "frogge-features-mapped.json"), JSON.stringify({ ...featuresFile, discordSettings }, null, 2))
writeFileSync(join(outDir, "frogge-verification-report.json"), JSON.stringify(report, null, 2))

console.log(`servers that are venues: ${Object.keys(venueKeyByGuild).length}`)
for (const [what, n] of Object.entries(report.counts)) console.log(`  ${what}: ${n}`)
console.log(`dropped: ${report.dropped.length}`)
const reasons = new Map<string, number>()
for (const d of report.dropped) reasons.set(`${d.what}: ${d.reason}`, (reasons.get(`${d.what}: ${d.reason}`) ?? 0) + 1)
for (const [reason, n] of reasons) console.log(`  dropped ${n}: ${reason}`)
