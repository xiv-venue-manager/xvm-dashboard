/**
 * One-off, idempotent migration of a single venue's Prisma Role rows (+ member
 * assignments) into xvm-api's Position module. Read-only against Prisma, only
 * writes to xvm-api over HTTP.
 *
 * Usage:
 *   npx tsx scripts/migrate-positions.ts <venueId>              # dry run (default)
 *   npx tsx scripts/migrate-positions.ts <venueId> --apply       # actually write
 */
import { PrismaClient } from "../generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  listPositions,
  createPosition,
  assignPositionMember,
  listMemberships,
  getMe,
} from "../lib/api/xvm-api"
import { hexColorToInt, gilToMinorUnits } from "../lib/api/position-convert"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// Inlined from lib/api/xvm-api-store.ts, backed by this script's own local
// `prisma` client instead of the app's shared singleton (lib/prisma.ts) —
// routing through that singleton would open a second Postgres pool that
// never gets disconnected. Same refresh margin and caching behavior as the
// originals.
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000 // 1 day

async function getValidXvmApiToken(userId: string): Promise<string | null> {
  const row = await prisma.xvmApiCredential.findUnique({ where: { userId } })
  if (!row) return null
  if (row.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS) return null
  return row.token
}

async function getValidXvmApiPersonId(userId: string): Promise<number | null> {
  const token = await getValidXvmApiToken(userId)
  if (!token) return null

  const row = await prisma.xvmApiCredential.findUnique({ where: { userId }, select: { personId: true } })
  if (row?.personId != null) return row.personId

  const me = await getMe(token)
  if (!me.person) return null

  await prisma.xvmApiCredential.update({ where: { userId }, data: { personId: me.person.id } })
  return me.person.id
}

async function main() {
  const [venueId, ...flags] = process.argv.slice(2)
  const apply = flags.includes("--apply")

  if (!venueId) {
    console.error("Usage: npx tsx scripts/migrate-positions.ts <venueId> [--apply]")
    process.exit(1)
  }

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — Position migration for venue ${venueId}\n`)

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true, xvmApiVenueId: true },
  })
  if (!venue) {
    console.error(`No such venue: ${venueId}`)
    process.exit(1)
  }
  if (!venue.xvmApiVenueId) {
    console.error(`Venue "${venue.name}" isn't linked to xvm-api yet (no xvmApiVenueId).`)
    process.exit(1)
  }

  const roles = await prisma.role.findMany({
    where: { venueId },
    include: {
      memberships: { select: { id: true, userId: true } },
      additionalFor: { include: { membership: { select: { id: true, userId: true } } } },
    },
  })
  if (roles.length === 0) {
    console.log(`Venue "${venue.name}" has no roles to migrate.`)
    return
  }

  // Any owner/manager on this venue with a valid stored token can act — we just
  // need one. Prefer the venue's actual owner.
  const ownerMembership = await prisma.membership.findFirst({
    where: { venueId, role: "OWNER", status: "active" },
    select: { userId: true },
  })
  if (!ownerMembership?.userId) {
    console.error(`No active owner found for venue "${venue.name}" — can't authenticate to xvm-api.`)
    process.exit(1)
  }

  const token = await getValidXvmApiToken(ownerMembership.userId)
  if (!token) {
    console.error(
      `Venue "${venue.name}"'s owner has no valid stored xvm-api token. They need to log in to the dashboard first.`
    )
    process.exit(1)
  }

  const existingPositions = await listPositions(token, venue.xvmApiVenueId)
  const existingMemberships = await listMemberships(token, venue.xvmApiVenueId)

  const seenRoleNames = new Set<string>()
  for (const role of roles) {
    const lowerName = role.name.toLowerCase()
    if (seenRoleNames.has(lowerName)) {
      console.warn(
        `  [warn] Multiple roles named "${role.name}" (case-insensitive) exist for this venue in Prisma — skipping to avoid merging their assignments. Resolve the duplicate manually.`
      )
      continue
    }
    seenRoleNames.add(lowerName)

    const existing = existingPositions.find((p) => p.name.toLowerCase() === lowerName)

    if (role.permissions && Object.keys(role.permissions as object).length > 0) {
      console.warn(`  [warn] Role "${role.name}" has non-empty permissions — this field is dropped by the migration.`)
    }

    let positionId: number
    if (existing) {
      console.log(`  [skip-create] Position "${role.name}" already exists (id ${existing.id})`)
      positionId = existing.id
    } else {
      let color: number | null
      try {
        color = hexColorToInt(role.color)
      } catch {
        console.warn(`  [warn] Role "${role.name}" has a malformed color ("${role.color}") — migrating with color: null`)
        color = null
      }
      const payload = {
        name: role.name,
        color,
        responsibilities: role.responsibilities,
        hourly_rate_minor: gilToMinorUnits(role.hourlyRate != null ? Number(role.hourlyRate) : null),
      }
      console.log(`  [create] Position "${role.name}"`, apply ? "" : "(dry run, not sent)", payload)
      if (apply) {
        const created = await createPosition(token, venue.xvmApiVenueId, payload)
        positionId = created.id
      } else {
        continue // can't assign members to a position that doesn't exist yet in dry-run
      }
    }

    // Members: Membership.roleId (primary) + MembershipRoleAssignment (additional).
    // Membership.userId is nullable (pending invites never accepted) — nothing to
    // resolve to an xvm-api person for those, so they're filtered out here.
    const memberUserIds = new Set<string>(
      [...role.memberships.map((m) => m.userId), ...role.additionalFor.map((a) => a.membership.userId)].filter(
        (id): id is string => id !== null
      )
    )

    for (const userId of memberUserIds) {
      const personId = await getValidXvmApiPersonId(userId)
      if (personId === null) {
        console.log(`    [skip-member] user ${userId} has no linked xvm-api account yet — not assigned`)
        continue
      }
      const xvmMembership = existingMemberships.find((m) => m.person.id === personId)
      if (!xvmMembership) {
        console.log(`    [skip-member] user ${userId} (person ${personId}) has no xvm-api membership at this venue`)
        continue
      }
      if (existing?.member_ids.includes(xvmMembership.id)) {
        console.log(`    [skip-assign] membership ${xvmMembership.id} already holds "${role.name}"`)
        continue
      }
      console.log(`    [assign] membership ${xvmMembership.id} -> "${role.name}"`, apply ? "" : "(dry run, not sent)")
      if (apply) {
        await assignPositionMember(token, venue.xvmApiVenueId, positionId, xvmMembership.id)
      }
    }
  }

  console.log(`\nDone.${apply ? "" : " Re-run with --apply to actually write."}\n`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
