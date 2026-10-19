import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { rescindInvite } from "@/lib/api/xvm-api"

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; inviteId: string }> }>(
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

    const { venueId, inviteId } = await context.params
    const id = Number(inviteId)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[staff/invites] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await rescindInvite(token, lookup.venue.id, id)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff] rescind invite error")
    }
  },
  { requests: 20, window: "1 m" }
)
