/**
 * Lists the upcoming shifts the shifts mapper skipped because they have no event to seat them on, grouped by venue and
 * recurring series, so each owner can re-create them in xvm-api. Local files only, and the output holds names: send each
 * owner only their own venue.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/unseated-shifts.ts <export dir> <mapped dir> <out.md>
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { renderUnseatedShifts, unseatedShifts } from "../lib/migration/unseated-shifts"

const [exportsDir, mappedDir, out] = process.argv.slice(2)
if (!exportsDir || !mappedDir || !out) {
  console.error("Usage: npx tsx scripts/unseated-shifts.ts <export dir> <mapped dir> <out.md>")
  process.exit(2)
}
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const shifts = read(join(exportsDir, "shifts.json"))
const positions = read(join(exportsDir, "positions.json"))
const people = read(join(exportsDir, "people.json"))
const venues = read(join(exportsDir, "venues.json"))
const mapped = read(join(mappedDir, "shifts-mapped.json")) as { skipped: { key: string }[] }

const result = unseatedShifts({
  shifts: shifts.shifts,
  roles: positions.roles,
  memberships: positions.memberships,
  users: people.users,
  venues: venues.venues,
  skippedShiftKeys: new Set(mapped.skipped.map((s) => s.key)),
  now: new Date(),
})
writeFileSync(out, renderUnseatedShifts(result))
console.log(`${result.reduce((n, v) => n + v.shiftCount, 0)} shifts in ${result.length} venues written to ${out}`)
