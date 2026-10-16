import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { requireMyVenueRole } from "@/lib/api/venue-access"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { grantServicePosition } from "@/lib/api/xvm-api"

const grantPositionSchema = z
  .object({
    positionId: z.number().int().positive(),
  })
  .strict()

export const POST = withRateLimit<{ params: Promise<{ venueId: string; serviceId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId, serviceId } = await context.params
    const lookup = await requireMyVenueRole(session.user.id, venueId, "MANAGER", "You don't have permission to manage service positions", "[service positions] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    let data: z.infer<typeof grantPositionSchema>
    try {
      data = grantPositionSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const service = await grantServicePosition(token, lookup.venue.id, Number(serviceId), data.positionId)
      return NextResponse.json(service)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/[serviceId]/positions] POST error")
    }
  },
  { requests: 20, window: "1 m" }
)
