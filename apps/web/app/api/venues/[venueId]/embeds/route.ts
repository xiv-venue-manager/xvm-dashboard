import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { createEmbed } from "@/lib/api/xvm-api"
import { bodyToApi, embedBodySchema } from "@/lib/embed-draft"

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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
    const lookup = await requireMyVenue(session.user.id, venueId, "[embeds] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof embedBodySchema>
    try {
      data = embedBodySchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(await createEmbed(token, lookup.venue.id, bodyToApi(data)), { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[embeds] POST error")
    }
  },
  { requests: 20, window: "1 m" }
)
