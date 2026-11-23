import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, getValidXvmApiPersonId, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { listMemberships, terminateMembership } from "@/lib/api/xvm-api"

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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

    const { venueId } = await context.params
    const lookup = await requireMyVenue(session.user.id, venueId, "[staff/me] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      const callerPersonId = await getValidXvmApiPersonId(session.user.id)
      const memberships = await listMemberships(token, lookup.venue.id)
      const mine = memberships.find((m) => m.person.id === callerPersonId)
      if (!mine) {
        return NextResponse.json({ error: "You are not a member of this venue" }, { status: 404 })
      }

      await terminateMembership(token, lookup.venue.id, mine.id)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff/me] DELETE error")
    }
  },
  { requests: 5, window: "1 m" }
)
