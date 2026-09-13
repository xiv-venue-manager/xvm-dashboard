/**
 * One-time, idempotent migration of every xvm-api-connected venue's Prisma
 * Service rows into xvm-api's Services module: free-text categories become
 * xvm-api ServiceCategory rows, each Service is re-created against xvm-api,
 * and a Manager-position grant is backfilled on each new service (preserving
 * today's "Manager always included" UI behavior — cosmetic only, xvm-api does
 * not enforce these grants server-side). Read-only against Prisma except for
 * writing back the new xvm-api service id for idempotency.
 *
 * Usage:
 *   npx tsx scripts/migrate-services-to-xvm-api.ts              # dry run (default)
 *   npx tsx scripts/migrate-services-to-xvm-api.ts --apply       # actually write
 */
import { PrismaClient } from "../generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  listServiceCategories,
  createServiceCategory,
  createService,
  grantServicePosition,
  listPositions,
} from "../lib/api/xvm-api"
import { dollarsToMinorUnits } from "../lib/api/position-convert"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// Inlined from lib/api/xvm-api-store.ts, backed by this script's own local
// `prisma` client instead of the app's shared singleton (lib/prisma.ts) —
// routing through that singleton would open a second Postgres pool that
// never gets disconnected. Same refresh margin as the original.
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000 // 1 day

async function getValidXvmApiToken(userId: string): Promise<string | null> {
  const row = await prisma.xvmApiCredential.findUnique({ where: { userId } })
  if (!row) return null
  if (row.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS) return null
  return row.token
}

async function main() {
  const apply = process.argv.slice(2).includes("--apply")
  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — Service migration for all xvm-api-connected venues\n`)

  const venues = await prisma.venue.findMany({
    where: { xvmApiVenueId: { not: null } },
    select: { id: true, name: true, xvmApiVenueId: true },
  })
  console.log(`Found ${venues.length} xvm-api-connected venue(s).\n`)

  for (const venue of venues) {
    console.log(`── Venue "${venue.name}" (${venue.id}) ──`)
    const xvmApiVenueId = venue.xvmApiVenueId!

    const services = await prisma.service.findMany({
      where: { venueId: venue.id },
      include: { roles: { select: { name: true } } },
    })
    if (services.length === 0) {
      console.log(`  No services to migrate.\n`)
      continue
    }

    const ownerMembership = await prisma.membership.findFirst({
      where: { venueId: venue.id, role: "OWNER", status: "active" },
      select: { userId: true },
    })
    if (!ownerMembership?.userId) {
      console.warn(`  [warn] No active owner found — can't authenticate to xvm-api. Skipping venue.\n`)
      continue
    }
    const token = await getValidXvmApiToken(ownerMembership.userId)
    if (!token) {
      console.warn(`  [warn] Venue owner has no valid stored xvm-api token. Skipping venue.\n`)
      continue
    }

    const existingCategories = await listServiceCategories(token, xvmApiVenueId)
    const existingPositions = await listPositions(token, xvmApiVenueId)
    const managerPosition = existingPositions.find((p) => p.name.toLowerCase() === "manager")
    if (!managerPosition) {
      console.warn(`  [warn] No "Manager" position found on xvm-api for this venue — position grants will be skipped.`)
    }

    // category name -> xvm-api category id, seeded with what already exists.
    const categoryIdByName = new Map<string, number>(existingCategories.map((c) => [c.name, c.id]))

    const distinctCategoryNames = [...new Set(services.map((s) => s.category).filter((c): c is string => !!c))]
    for (const name of distinctCategoryNames) {
      if (categoryIdByName.has(name)) {
        console.log(`  [skip-create-category] "${name}" already exists (id ${categoryIdByName.get(name)})`)
        continue
      }
      console.log(`  [create-category] "${name}"`, apply ? "" : "(dry run, not sent)")
      if (apply) {
        const created = await createServiceCategory(token, xvmApiVenueId, { name })
        categoryIdByName.set(name, created.id)
      }
    }

    for (const service of services) {
      if (service.xvmApiServiceId) {
        console.log(`  [skip-already-migrated] "${service.name}" (xvm-api id ${service.xvmApiServiceId})`)
        continue
      }

      const categoryId = service.category ? categoryIdByName.get(service.category) ?? null : null
      const payload = {
        name: service.name,
        description: service.description,
        price_minor: dollarsToMinorUnits(Number(service.price)),
        category_id: categoryId,
        is_active: service.isActive,
      }
      console.log(`  [create-service] "${service.name}"`, apply ? "" : "(dry run, not sent)", payload)

      if (!apply) continue // can't grant positions on a service that doesn't exist yet in dry-run

      const created = await createService(token, xvmApiVenueId, payload)
      await prisma.service.update({ where: { id: service.id }, data: { xvmApiServiceId: created.id } })

      // Manager is always granted for UI consistency, plus any other Prisma
      // roles this service had. Position names are matched case-insensitively.
      const roleNames = new Set([...(managerPosition ? ["manager"] : []), ...service.roles.map((r) => r.name.toLowerCase())])
      for (const roleName of roleNames) {
        const position = existingPositions.find((p) => p.name.toLowerCase() === roleName)
        if (!position) {
          console.warn(`    [warn] No xvm-api position matching "${roleName}" — grant skipped`)
          continue
        }
        console.log(`    [grant] "${position.name}" -> service "${service.name}"`)
        await grantServicePosition(token, xvmApiVenueId, created.id, position.id)
      }
    }
    console.log("")
  }

  console.log(`Done.${apply ? "" : " Re-run with --apply to actually write."}\n`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
