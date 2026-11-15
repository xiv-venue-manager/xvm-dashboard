import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { deleteVipPost } from "@/lib/api/xvm-api"
import { postCreateSchema } from "@/lib/vips"

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; kind: string; channelId: string }> }>(
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

    const { venueId, kind, channelId } = await context.params

    const lookup = await requireMyVenue(session.user.id, venueId, "[vips] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const target = postCreateSchema.safeParse({ kind, channelId })
    if (!target.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      await deleteVipPost(token, lookup.venue.id, target.data.kind, target.data.channelId)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[vips/posts/:kind/:channel] DELETE error")
    }
  },
  { requests: 10, window: "1 m" }
)
