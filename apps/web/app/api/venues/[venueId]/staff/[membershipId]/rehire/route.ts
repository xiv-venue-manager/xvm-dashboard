import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, getValidXvmApiPersonId, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { rehireMembership, listMemberships } from "@/lib/api/xvm-api"

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findFirst({
    where: { OR: [{ id: venueId }, { slug: venueId }] },
    select: { xvmApiVenueId: true },
  })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const POST = withRateLimit<{ params: Promise<{ venueId: string; membershipId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, membershipId } = await context.params
    const id = Number(membershipId)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const callerPersonId = await getValidXvmApiPersonId(session.user.id)
      const memberships = await listMemberships(token, gate.xvmApiVenueId!)

      const targetMembership = memberships.find((m) => m.id === id)
      if (!targetMembership) {
        return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
      }
      if (targetMembership.is_employed) {
        return NextResponse.json({ error: "This staff member is already active" }, { status: 409 })
      }

      // Defense-in-depth only - xvm-api's rehire endpoint already enforces
      // authority server-side. Not the sole guard.
      const callerMembership = memberships.find((m) => m.person.id === callerPersonId)
      if (!callerMembership || !["owner", "manager"].includes(callerMembership.effective_tier)) {
        return NextResponse.json({ error: "You don't have permission to rehire staff" }, { status: 403 })
      }
      if (callerMembership.effective_tier === "manager" && targetMembership.effective_tier !== "staff") {
        return NextResponse.json({ error: "Managers can only rehire former staff" }, { status: 403 })
      }

      const rehired = await rehireMembership(token, gate.xvmApiVenueId!, id)
      return NextResponse.json({ success: true, membership: rehired })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff] rehire error")
    }
  },
  { requests: 5, window: "1 m" }
)
