/**
 * Maps a venues export into the rows xvm-api's venues, venue_external_links and venue_images need.
 * Reads JSON files and never touches Prisma or xvm-api. Run map-people.ts and map-venue-timezones.ts
 * first: a link only names a person it loaded, and every venue takes the timezone that file proposes.
 *
 * Settings xvm-api has no home for (tagline, tags, adult flag, open nights, default hours, the shift bot
 * and notification settings) come out in `leftovers`, so nothing is lost while that question is open.
 * Test venues (venue type TEST_VENUE) are left out, by decision. Pass --include-test-venues to keep them.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/venues.sql > venues-export.json
 *   npx tsx scripts/map-venues.ts venues-export.json people-mapped.json venue-timezones-review.json venues-mapped.json [--include-test-venues]
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapVenues, type VenuesExport } from "../lib/migration/venues"

const args = process.argv.slice(2)
const skipTestVenues = !args.includes("--include-test-venues")
const [input, peopleFile, timezonesFile, output] = args.filter((a) => !a.startsWith("--"))
if (!input || !peopleFile || !timezonesFile || !output) {
  console.error("Usage: npx tsx scripts/map-venues.ts <venues-export.json> <people-mapped.json> <venue-timezones-review.json> <out.json> [--include-test-venues]")
  process.exit(1)
}

const read = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T
const source = read<VenuesExport>(input)
const people = read<{ people: { key: string }[] }>(peopleFile)
const timezones = read<{ venues: { venue_key: string; timezone: string }[] }>(timezonesFile)

const result = mapVenues(source, {
  personKeys: new Set(people.people.map((p) => p.key)),
  timezones: new Map(timezones.venues.map((v) => [v.venue_key, v.timezone])),
  skipTestVenues,
})
writeFileSync(output, JSON.stringify(result, null, 2))

console.log(`venues:         ${result.venues.length} of ${source.venues.length}${skipTestVenues ? " (test venues left out)" : " (test venues included)"}`)
console.log(`external links: ${result.externalLinks.length} (${result.externalLinks.filter((l) => l.provider === "Partake").length} Partake, ${result.externalLinks.filter((l) => l.provider === "FFXIVVenues").length} ffxivvenues.com)`)
console.log(`gallery images: ${result.images.length} over ${new Set(result.images.map((i) => i.venue_key)).size} venues`)
console.log(`leftover settings: ${result.leftovers.length} venues`)
console.log(`skipped:        ${result.skipped.length}`)
for (const s of result.skipped) console.log(`  skipped ${s.key}: ${s.reason}`)
console.log(`warnings:       ${result.warnings.length}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
