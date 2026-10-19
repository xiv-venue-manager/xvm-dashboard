/**
 * Maps the venue pot and inventory settings into the rows xvm-api needs: venue_payroll_settings
 * for the pot tax and flags, and an inventory module toggle for the inventory switch. Reads a JSON
 * export and never touches Prisma or xvm-api.
 *
 * xvm-api has no column for "the pot is switched on", so the venues that had it on come out in a
 * separate list, potEnabledVenues, until that question is answered.
 *
 * Usage (from apps/web):
 *   psql "$DATABASE_URL" -At -f scripts/export/settings.sql > settings-export.json
 *   npx tsx scripts/map-settings.ts settings-export.json settings-mapped.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { mapSettings, type SettingsExport } from "../lib/migration/settings"

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error("Usage: npx tsx scripts/map-settings.ts <settings-export.json> <out.json>")
  process.exit(1)
}

const source = JSON.parse(readFileSync(input, "utf8")) as SettingsExport
const result = mapSettings(source)
writeFileSync(output, JSON.stringify(result, null, 2))

console.log(`pot rows:           ${source.pot.length}`)
console.log(`payroll settings:   ${result.payrollSettings.length} (${result.payrollSettings.filter((s) => s.tax_basis_points > 0).length} with a tax)`)
console.log(`pot switched on:    ${result.potEnabledVenues.length} venues (no home in xvm-api yet)`)
console.log(`inventory rows:     ${source.inventory.length}, ${result.modules.length} enabled`)
console.log(`skipped:  ${result.skipped.length}`)
for (const s of result.skipped) console.log(`  skipped ${s.key}: ${s.reason}`)
console.log(`warnings: ${result.warnings.length}`)
for (const w of result.warnings) console.log(`  ${w.key}: ${w.message}`)
