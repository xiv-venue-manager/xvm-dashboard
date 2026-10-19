/**
 * Maps a finance export into the rows xvm-api's transactions and payroll_entries need. Reads JSON
 * files and never touches Prisma or xvm-api. Run map-people.ts, map-positions.ts, map-events.ts
 * and map-services.ts first: a row only links to a person, membership, event and service they
 * loaded, and a manual payroll payee belongs to the placeholder person map-people.ts made.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/finance.sql > finance-export.json
 *   npx tsx scripts/map-finance.ts finance-export.json people-mapped.json positions-mapped.json \
 *     events-mapped.json services-mapped.json finance-mapped.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapFinance, type FinanceExport } from "../lib/migration/finance"

const [input, peopleFile, positionsFile, eventsFile, servicesFile, output] = process.argv.slice(2)
if (!input || !peopleFile || !positionsFile || !eventsFile || !servicesFile || !output) {
  console.error("Usage: npx tsx scripts/map-finance.ts <finance-export> <people-mapped> <positions-mapped> <events-mapped> <services-mapped> <out>")
  process.exit(1)
}

const read = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T
const source = read<FinanceExport>(input)
const people = read<{ people: { key: string }[] }>(peopleFile)
const positions = read<{ memberships: { key: string; venue_key: string; person_key: string }[] }>(positionsFile)
const events = read<{ events: { key: string }[] }>(eventsFile)
const services = read<{ services: { key: string }[] }>(servicesFile)

const personKeys = new Set(people.people.map((p) => p.key))
const result = mapFinance(source, {
  personKeys,
  memberships: new Map(positions.memberships.map((m) => [m.key, { venue: m.venue_key, person: m.person_key }])),
  eventKeys: new Set(events.events.map((e) => e.key)),
  serviceKeys: new Set(services.services.map((s) => s.key)),
})
writeFileSync(output, JSON.stringify(result, null, 2))

const payees = result.payroll.filter((p) => p.person_key.startsWith("payee:"))
const missingPayees = new Set(payees.map((p) => p.person_key).filter((k) => !personKeys.has(k)))
const sum = (rows: { amount: number }[]) => rows.reduce((total, r) => total + r.amount, 0)
console.log(`transactions: ${result.transactions.length} of ${source.transactions.length} (total ${sum(result.transactions)})`)
console.log(`payroll:      ${result.payroll.length} of ${source.payroll.length} (total ${result.payroll.reduce((t, p) => t + p.total_amount_minor, 0)})`)
console.log(`payees:       ${new Set(payees.map((p) => p.person_key)).size} placeholder people used, ${missingPayees.size} not in the people list`)
console.log(`skipped:      ${result.skipped.length}`)
for (const s of result.skipped) console.log(`  skipped ${s.key}: ${s.reason}`)
console.log(`warnings:     ${result.warnings.length}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
