import { cache } from "react"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { listMyVenues, type MyVenueRow } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

export type VenueRole = "OWNER" | "MANAGER" | "STAFF"

const RANK: Record<VenueRole, number> = { STAFF: 0, MANAGER: 1, OWNER: 2 }

export function atLeast(role: VenueRole | null, minimum: VenueRole): boolean {
  return role !== null && RANK[role] >= RANK[minimum]
}

export class VenueAccessUnavailable extends Error {}

function toRole(tier: string): VenueRole | null {
  const role = tier.toUpperCase()
  if (role === "OWNER" || role === "MANAGER" || role === "STAFF") return role
  console.warn(`[venue-access] unrecognised membership tier "${tier}"; the venue is hidden from this caller`)
  return null
}

const rowsFor = cache(async (userId: string): Promise<MyVenueRow[]> => {
  const token = await getValidXvmApiToken(userId)
  if (!token) throw new VenueAccessUnavailable("No valid xvm-api credential")
  return (await listMyVenues(token)).filter((row) => row.venue.is_active)
})

const tiersFor = cache(async (userId: string): Promise<Map<string, VenueRole>> => {
  const tiers = new Map<string, VenueRole>()
  for (const row of await rowsFor(userId)) {
    const role = toRole(row.effective_tier)
    if (role) tiers.set(row.venue.id, role)
  }
  return tiers
})

export type MyVenue = {
  id: string
  name: string
  slug: string
  dataCenter: string
  world: string
  timezone: string
  role: VenueRole
}

export async function myVenues(userId: string): Promise<MyVenue[]> {
  const venues: MyVenue[] = []
  for (const { venue, effective_tier } of await rowsFor(userId)) {
    const role = toRole(effective_tier)
    if (role) {
      venues.push({
        id: venue.id,
        name: venue.name,
        slug: venue.slug,
        dataCenter: venue.data_center,
        world: venue.world,
        timezone: venue.timezone,
        role,
      })
    }
  }
  return venues
}

// An id is tried before a slug. That is unambiguous because xvm-api ids are a prefix, an underscore and
// 16 alphanumerics (generate_short_id), while a slug is lowercase letters, digits and hyphens: the
// underscore keeps the two apart. If xvm-api ever minted an unprefixed id, this would need a test.
export async function resolveMyVenue(userId: string, ref: string): Promise<MyVenue | null> {
  const venues = await myVenues(userId)
  return venues.find((v) => v.id === ref) ?? venues.find((v) => v.slug === ref) ?? null
}

export async function roleInVenue(
  userId: string,
  venue: { xvmApiVenueId: string | null }
): Promise<VenueRole | null> {
  if (!venue.xvmApiVenueId) return null
  return (await tiersFor(userId)).get(venue.xvmApiVenueId) ?? null
}

export async function myVenueRoles(userId: string): Promise<Map<string, VenueRole>> {
  const tiers = await tiersFor(userId)
  const venues = await prisma.venue.findMany({
    where: { xvmApiVenueId: { in: [...tiers.keys()] } },
    select: { id: true, xvmApiVenueId: true },
  })
  const roles = new Map<string, VenueRole>()
  for (const venue of venues) {
    if (!venue.xvmApiVenueId) continue
    const role = tiers.get(venue.xvmApiVenueId)
    if (role) roles.set(venue.id, role)
  }
  return roles
}

export function asMembership(userId: string, venueId: string, role: VenueRole) {
  return { userId, venueId, role, status: "active" }
}

export type VenueAccess = { ok: true; role: VenueRole } | { ok: false; response: NextResponse }

export async function requireVenueRole(
  userId: string,
  venueId: string,
  minimum: VenueRole,
  forbiddenMessage: string
): Promise<VenueAccess> {
  const deny = (): VenueAccess => ({
    ok: false,
    response: NextResponse.json({ error: forbiddenMessage }, { status: 403 }),
  })
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue) return deny()
  try {
    const role = await roleInVenue(userId, venue)
    return role && atLeast(role, minimum) ? { ok: true, role } : deny()
  } catch (err) {
    if (err instanceof VenueAccessUnavailable) {
      return { ok: false, response: NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }) }
    }
    return { ok: false, response: await xvmApiErrorResponse(err, userId, "[venue access] /me/venues read error") }
  }
}

export type VenueLookup = { ok: true; venue: MyVenue } | { ok: false; response: NextResponse }

export async function requireMyVenue(userId: string, ref: string, logLabel: string): Promise<VenueLookup> {
  try {
    const venue = await resolveMyVenue(userId, ref)
    if (venue) return { ok: true, venue }
    return { ok: false, response: NextResponse.json({ error: "Venue not found" }, { status: 404 }) }
  } catch (err) {
    if (err instanceof VenueAccessUnavailable) {
      return { ok: false, response: NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }) }
    }
    return { ok: false, response: await xvmApiErrorResponse(err, userId, logLabel) }
  }
}

export async function requireMyVenueRole(
  userId: string,
  ref: string,
  minimum: VenueRole,
  forbiddenMessage: string,
  logLabel: string
): Promise<VenueLookup> {
  const lookup = await requireMyVenue(userId, ref, logLabel)
  if (!lookup.ok || atLeast(lookup.venue.role, minimum)) return lookup
  return { ok: false, response: NextResponse.json({ error: forbiddenMessage }, { status: 403 }) }
}
