import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { listActivity } from "@/lib/api/xvm-api"
import { ACTIVITY_MODULES } from "@/lib/activity-log"

const querySchema = z.object({
  module: z.enum(ACTIVITY_MODULES).optional(),
  actorPersonId: z.coerce.number().int().min(1).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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

    const { searchParams } = new URL(request.url)
    const query = querySchema.safeParse({
      module: searchParams.get("module") ?? undefined,
      actorPersonId: searchParams.get("actorPersonId") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    })
    if (!query.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const { venueId } = await context.params
    const lookup = await requireMyVenue(session.user.id, venueId, "[activity] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      return NextResponse.json(await listActivity(token, lookup.venue.id, query.data))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[activity] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)
