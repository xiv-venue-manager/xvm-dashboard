import { cache } from "react"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { listMyVenues } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

export type VenueRole = "OWNER" | "MANAGER" | "STAFF"

const RANK: Record<VenueRole, number> = { STAFF: 0, MANAGER: 1, OWNER: 2 }

export function atLeast(role: VenueRole | null, minimum: VenueRole): boolean {
  return role !== null && RANK[role] >= RANK[minimum]
}

export class VenueAccessUnavailable extends Error {}

function toRole(tier: string): VenueRole | null {
  const role = tier.toUpperCase()
  return role === "OWNER" || role === "MANAGER" || role === "STAFF" ? role : null
}

const tiersFor = cache(async (userId: string): Promise<Map<string, VenueRole>> => {
  const token = await getValidXvmApiToken(userId)
  if (!token) throw new VenueAccessUnavailable("No valid xvm-api credential")
  const tiers = new Map<string, VenueRole>()
  for (const row of await listMyVenues(token)) {
    const role = toRole(row.effective_tier)
    if (role) tiers.set(row.venue.id, role)
  }
  return tiers
})

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
