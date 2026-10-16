import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { revokeTierGrant } from "@/lib/api/xvm-api"

export const POST = withRateLimit<{ params: Promise<{ venueId: string; membershipId: string; grantId: string }> }>(
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

    const { venueId, membershipId, grantId } = await context.params
    const id = Number(membershipId)
    const grant = Number(grantId)
    if (!Number.isInteger(id) || !Number.isInteger(grant)) {
      return NextResponse.json({ error: "Staff member or grant not found" }, { status: 404 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[staff/tier-grants/revoke] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      const revoked = await revokeTierGrant(token, lookup.venue.id, id, grant)
      return NextResponse.json(revoked)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff/tier-grants/revoke] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
