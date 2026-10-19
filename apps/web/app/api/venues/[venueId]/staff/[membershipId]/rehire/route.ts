import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, getValidXvmApiPersonId, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { rehireMembership, listMemberships } from "@/lib/api/xvm-api"

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

    const lookup = await requireMyVenue(session.user.id, venueId, "[staff/rehire] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      const callerPersonId = await getValidXvmApiPersonId(session.user.id)
      const memberships = await listMemberships(token, lookup.venue.id)

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

      const rehired = await rehireMembership(token, lookup.venue.id, id)
      return NextResponse.json({ success: true, membership: rehired })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff] rehire error")
    }
  },
  { requests: 5, window: "1 m" }
)
