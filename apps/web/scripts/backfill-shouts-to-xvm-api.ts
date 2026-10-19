/**
 * One-time, idempotent copy of every saved Shout Crafter shout into xvm-api.
 * Reads a JSON export and never touches Prisma. Each owner's shouts are written
 * through /me/shouts with a token minted from their Discord id, the same exchange
 * sign-in uses, so dormant users with expired stored tokens are covered.
 *
 * Usage (from apps/web, with XVM_API_BASE_URL and XVM_API_DASHBOARD_SERVICE_TOKEN set):
 *   psql "$DATABASE_URL" -At -f scripts/export-shouts.sql > shouts-export.json
 *   npx tsx scripts/backfill-shouts-to-xvm-api.ts shouts-export.json           # dry run (default)
 *   npx tsx scripts/backfill-shouts-to-xvm-api.ts shouts-export.json --apply   # actually write
 */
import { readFileSync } from "node:fs"
import { createShout, exchangeToken, listShouts, XvmApiError } from "../lib/api/xvm-api"
import { planBackfill, type ExportedShout } from "../lib/shout-backfill"

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes("--apply")
  const file = args.find((arg) => !arg.startsWith("--"))
  if (!file) throw new Error("Usage: backfill-shouts-to-xvm-api.ts <export.json> [--apply]")

  const rows = JSON.parse(readFileSync(file, "utf8")) as ExportedShout[]
  const plan = planBackfill(rows)
  const planned = plan.people.reduce((sum, person) => sum + person.shouts.length, 0)

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} - shout backfill`)
  console.log(`Export rows: ${rows.length}. People: ${plan.people.length}. Shouts to copy: ${planned}.\n`)

  if (plan.problems.length > 0) {
    console.log(`Not copied (${plan.problems.length}), these need a decision by hand:`)
    for (const problem of plan.problems) {
      console.log(`  - ${problem.reason}: "${problem.label}" (discord ${problem.discordId ?? "none"})`)
    }
    console.log("")
  }

  if (!apply) {
    console.log("Dry run does not contact xvm-api: minting a token creates the person if they are new.")
    console.log("Re-run with --apply to write.\n")
    return
  }

  const summary = { created: 0, alreadyThere: 0, failed: [] as string[], countMismatch: [] as string[] }

  for (const person of plan.people) {
    try {
      const { secret: token } = await exchangeToken(person.discordId, person.displayName)
      const existing = new Set((await listShouts(token)).map((shout) => shout.label.trim().toLowerCase()))

      for (const shout of person.shouts) {
        if (existing.has(shout.label.toLowerCase())) {
          summary.alreadyThere++
          continue
        }
        try {
          await createShout(token, shout)
          summary.created++
        } catch (err) {
          if (err instanceof XvmApiError && err.status === 409) {
            summary.alreadyThere++
            continue
          }
          console.error(`  [error] "${shout.label}" for discord ${person.discordId}:`, err)
          summary.failed.push(`"${shout.label}" (discord ${person.discordId})`)
        }
      }

      const after = (await listShouts(token)).length
      if (after < person.shouts.length) {
        summary.countMismatch.push(`discord ${person.discordId}: expected at least ${person.shouts.length}, xvm-api has ${after}`)
      }
    } catch (err) {
      console.error(`  [error] discord ${person.discordId}:`, err)
      summary.failed.push(`all shouts for discord ${person.discordId}`)
    }
  }

  console.log("── Summary ──")
  console.log(`Created: ${summary.created}`)
  console.log(`Already in xvm-api: ${summary.alreadyThere}`)
  console.log(`Failed: ${summary.failed.length}`)
  summary.failed.forEach((item) => console.log(`  - ${item}`))
  console.log(`Count mismatches after the run: ${summary.countMismatch.length}`)
  summary.countMismatch.forEach((item) => console.log(`  - ${item}`))
  console.log("")

  if (summary.failed.length > 0 || summary.countMismatch.length > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
