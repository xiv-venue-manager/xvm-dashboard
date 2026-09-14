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

  const summary = {
    venuesSkipped: [] as string[],
    venuesErrored: [] as string[],
    servicesCreated: 0,
    servicesSkippedAlreadyMigrated: 0,
    servicesIncompleteGrants: [] as string[],
    servicesOrphanedWriteback: [] as string[],
  }

  for (const venue of venues) {
    console.log(`── Venue "${venue.name}" (${venue.id}) ──`)
    const xvmApiVenueId = venue.xvmApiVenueId!

    try {
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
        summary.venuesSkipped.push(`${venue.id} (no active owner)`)
        continue
      }
      const token = await getValidXvmApiToken(ownerMembership.userId)
      if (!token) {
        console.warn(`  [warn] Venue owner has no valid stored xvm-api token. Skipping venue.\n`)
        summary.venuesSkipped.push(`${venue.id} (no valid token)`)
        continue
      }

      const existingCategories = await listServiceCategories(token, xvmApiVenueId)
      const existingPositions = await listPositions(token, xvmApiVenueId)
      const managerPosition = existingPositions.find((p) => p.name.toLowerCase() === "manager")
      if (!managerPosition) {
        console.warn(`  [warn] No "Manager" position found on xvm-api for this venue — position grants will be skipped.`)
      }

      // lowercased category name -> xvm-api category id, seeded with what already exists.
      // Matched case-insensitively, same as position matching below, so "Drinks" and
      // "drinks" collapse into one xvm-api category rather than becoming two.
      // A category the dry run would create has no real id yet, so it's held as a
      // pending-name placeholder instead — never a fabricated number.
      type CategoryRef = number | { pendingName: string }
      const categoryIdByName = new Map<string, CategoryRef>(existingCategories.map((c) => [c.name.toLowerCase(), c.id]))

      const distinctCategoryNames = [...new Set(services.map((s) => s.category).filter((c): c is string => !!c))]
      for (const name of distinctCategoryNames) {
        const key = name.toLowerCase()
        if (categoryIdByName.has(key)) {
          console.log(`  [skip-create-category] "${name}" already exists (id ${categoryIdByName.get(key)})`)
          continue
        }
        console.log(`  [create-category] "${name}"`, apply ? "" : "(dry run, not sent)")
        if (apply) {
          const created = await createServiceCategory(token, xvmApiVenueId, { name })
          categoryIdByName.set(key, created.id)
        } else {
          categoryIdByName.set(key, { pendingName: name })
        }
      }

      for (const service of services) {
        if (service.xvmApiServiceId) {
          console.log(`  [skip-already-migrated] "${service.name}" (xvm-api id ${service.xvmApiServiceId})`)
          summary.servicesSkippedAlreadyMigrated++
          continue
        }

        const categoryRef = service.category ? categoryIdByName.get(service.category.toLowerCase()) ?? null : null
        const categoryId = typeof categoryRef === "number" ? categoryRef : null
        const payload = {
          name: service.name,
          description: service.description,
          price_minor: dollarsToMinorUnits(Number(service.price)),
          category_id: categoryId,
          is_active: service.isActive,
        }
        const loggedCategoryId = categoryRef && typeof categoryRef !== "number" ? `<new "${categoryRef.pendingName}">` : categoryId
        console.log(`  [create-service] "${service.name}"`, apply ? "" : "(dry run, not sent)", {
          ...payload,
          category_id: loggedCategoryId,
        })

        if (!apply) continue // can't grant positions on a service that doesn't exist yet in dry-run

        const created = await createService(token, xvmApiVenueId, payload)
        summary.servicesCreated++

        try {
          await prisma.service.update({ where: { id: service.id }, data: { xvmApiServiceId: created.id } })
        } catch (err) {
          // The service now exists in xvm-api but Prisma doesn't know it — a re-run
          // would create a duplicate rather than skip it, same permanence as a failed
          // grant, so it gets the same manual-follow-up treatment.
          console.error(
            `    [error] Created "${service.name}" in xvm-api (id ${created.id}) but failed to write xvmApiServiceId back to Prisma:`,
            err,
          )
          summary.servicesOrphanedWriteback.push(`${service.name} (venue ${venue.id}, xvm-api service id ${created.id})`)
        }

        // Manager is always granted for UI consistency, plus any other Prisma
        // roles this service had. Position names are matched case-insensitively.
        // Each grant is isolated: a failed grant must not abort the venue loop,
        // nor silently leave the service's grants incomplete — since
        // xvmApiServiceId is already written back above, a re-run would skip
        // this service entirely, so any grant failure here is permanent unless
        // flagged in the summary for manual follow-up.
        const roleNames = new Set([...(managerPosition ? ["manager"] : []), ...service.roles.map((r) => r.name.toLowerCase())])
        let hadGrantFailure = false
        for (const roleName of roleNames) {
          const position = existingPositions.find((p) => p.name.toLowerCase() === roleName)
          if (!position) {
            console.warn(`    [warn] No xvm-api position matching "${roleName}" — grant skipped`)
            continue
          }
          try {
            console.log(`    [grant] "${position.name}" -> service "${service.name}"`)
            await grantServicePosition(token, xvmApiVenueId, created.id, position.id)
          } catch (err) {
            hadGrantFailure = true
            console.error(
              `    [error] Failed to grant "${position.name}" on service "${service.name}" (xvm-api id ${created.id}):`,
              err,
            )
          }
        }
        if (hadGrantFailure) {
          summary.servicesIncompleteGrants.push(`${service.name} (venue ${venue.id}, xvm-api service id ${created.id})`)
        }
      }
      console.log("")
    } catch (err) {
      console.error(`  [error] Venue "${venue.name}" (${venue.id}) failed:`, err)
      summary.venuesErrored.push(venue.id)
    }
  }

  console.log("── Summary ──")
  console.log(`Venues found: ${venues.length}`)
  console.log(`Venues skipped: ${summary.venuesSkipped.length}`)
  summary.venuesSkipped.forEach((v) => console.log(`  - ${v}`))
  console.log(`Venues errored: ${summary.venuesErrored.length}`)
  summary.venuesErrored.forEach((v) => console.log(`  - ${v}`))
  console.log(`Services created: ${summary.servicesCreated}`)
  console.log(`Services skipped (already migrated): ${summary.servicesSkippedAlreadyMigrated}`)
  console.log(`Services created with incomplete grants: ${summary.servicesIncompleteGrants.length}`)
  summary.servicesIncompleteGrants.forEach((s) => console.log(`  - ${s}`))
  console.log(`Services created but not written back to Prisma (re-run will duplicate): ${summary.servicesOrphanedWriteback.length}`)
  summary.servicesOrphanedWriteback.forEach((s) => console.log(`  - ${s}`))
  console.log(`\nDone.${apply ? "" : " Re-run with --apply to actually write."}\n`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
