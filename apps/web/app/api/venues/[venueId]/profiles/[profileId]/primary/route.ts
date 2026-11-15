import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { profileAction } from "@/lib/api/xvm-api"

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; profileId: string }> }>(
  async (_request, context) => {
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

    const { venueId, profileId } = await context.params
    const profileNum = parseId(profileId)
    if (profileNum === null) {
      return NextResponse.json({ error: "Invalid profile id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[profiles] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      return NextResponse.json(await profileAction(token, lookup.venue.id, profileNum, "primary"))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[profiles/:id/primary] PUT error")
    }
  },
  { requests: 30, window: "1 m" }
)
