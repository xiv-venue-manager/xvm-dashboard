import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { updateHours, deleteHours } from "@/lib/api/xvm-api"

const updateHoursSchema = z
  .object({
    label: z.string().trim().max(100).nullable().optional(),
    enabled: z.boolean().nullable().optional(),
  })
  .strict()

type Context = { params: Promise<{ venueId: string; hoursId: string }> }

export const PATCH = withRateLimit<Context>(
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

    const { venueId, hoursId } = await context.params

    const lookup = await requireMyVenue(session.user.id, venueId, "[hours] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof updateHoursSchema>
    try {
      data = updateHoursSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const hours = await updateHours(token, lookup.venue.id, Number(hoursId), data)
      return NextResponse.json(hours)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[hours] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<Context>(
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

    const { venueId, hoursId } = await context.params

    const lookup = await requireMyVenue(session.user.id, venueId, "[hours] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deleteHours(token, lookup.venue.id, Number(hoursId))
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[hours] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
