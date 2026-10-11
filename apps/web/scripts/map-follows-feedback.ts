/**
 * Maps a follows and feedback export into the rows xvm-api's venue_follows and feedback need.
 * Reads JSON files and never touches Prisma or xvm-api. Run map-people.ts first: a row only links
 * to a person it loaded.
 *
 * Closed reports that look like tests or messages are listed as suggested drops but still loaded.
 * Pass a file with a JSON array of feedback ids to leave those out.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/follows-feedback.sql > follows-feedback-export.json
 *   npx tsx scripts/map-follows-feedback.ts follows-feedback-export.json people-mapped.json out.json [exclude.json]
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapFollowsFeedback, type FollowsFeedbackExport } from "../lib/migration/follows-feedback"

const [input, peopleFile, output, excludeFile] = process.argv.slice(2)
if (!input || !peopleFile || !output) {
  console.error("Usage: npx tsx scripts/map-follows-feedback.ts <export.json> <people-mapped.json> <out.json> [exclude.json]")
  process.exit(1)
}

const read = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T
const source = read<FollowsFeedbackExport>(input)
const people = read<{ people: { key: string }[] }>(peopleFile)
const exclude = excludeFile ? read<string[]>(excludeFile) : []

const result = mapFollowsFeedback(source, {
  personKeys: new Set(people.people.map((p) => p.key)),
  excludeFeedback: new Set(exclude),
})
writeFileSync(output, JSON.stringify(result, null, 2))

const count = (rows: { status: string }[], statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).length
console.log(`follows:  ${result.follows.length} of ${source.follows.length} across ${new Set(result.follows.map((f) => f.venue_key)).size} venues`)
console.log(`feedback: ${result.feedback.length} of ${source.feedback.length} (${count(result.feedback, ["new", "under_review", "planned", "in_progress"])} open, ${count(result.feedback, ["completed", "wont_fix"])} closed)`)
console.log(`suggested drops: ${result.suggestedDrops.length}`)
for (const d of result.suggestedDrops) console.log(`  ${d.key}: ${d.reason}`)
console.log(`skipped:  ${result.skipped.length}`)
for (const s of result.skipped) console.log(`  skipped ${s.key}: ${s.reason}`)
console.log(`warnings: ${result.warnings.length}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
