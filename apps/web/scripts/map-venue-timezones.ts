/**
 * Proposes a timezone for every venue, and lists how sure each proposal is, so owners can confirm
 * or correct it after the load. Reads a JSON export and never touches Prisma or xvm-api.
 *
 * Prisma stores every venue as UTC, and xvm-api's venue timezone defaults to America/New_York, so the
 * load must always set it explicitly. A venue takes the most common timezone of its own events, else
 * UTC. UTC is lossless for a venue with no signal: its old shifts and opening hours were stored in UTC
 * Server Time, so UTC keeps their exact absolute times.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/venue-timezones.sql > venue-timezones-export.json
 *   npx tsx scripts/map-venue-timezones.ts venue-timezones-export.json venue-timezones-review.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { proposeVenueTimezones, type VenueTimezoneInput } from "../lib/migration/venue-timezones"

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error("Usage: npx tsx scripts/map-venue-timezones.ts <export.json> <review.json>")
  process.exit(1)
}

const source = JSON.parse(readFileSync(input, "utf8")) as { venues: VenueTimezoneInput[] }
const result = proposeVenueTimezones(source.venues)
writeFileSync(output, JSON.stringify(result, null, 2))

const s = result.summary
console.log(`venues:        ${s.total}`)
console.log(`one zone:      ${s.oneZone}`)
console.log(`mixed:         ${s.mixed}`)
console.log(`no events:     ${s.none} (UTC)`)
console.log(`suspect (UTC): ${s.suspect}`)
const zones = new Map<string, number>()
for (const v of result.venues) zones.set(v.timezone, (zones.get(v.timezone) ?? 0) + 1)
console.log(`zones:         ${[...zones].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`)
