import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { grantVip, resolveDiscordPerson } from "@/lib/api/xvm-api"
import { grantSchema } from "@/lib/vips"

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

    const lookup = await requireMyVenue(session.user.id, venueId, "[vips] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof grantSchema>
    try {
      data = grantSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const person = await resolveDiscordPerson(token, lookup.venue.id, {
        discord_user_id: data.discordUserId,
        display_name: data.displayName,
      })
      return NextResponse.json(
        await grantVip(token, lookup.venue.id, {
          person_id: person.id,
          tier_id: data.tierId,
          ...(data.expiresAt !== undefined && { expires_at: data.expiresAt }),
          ...(data.notes !== undefined && { notes: data.notes }),
        }),
        { status: 201 }
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[vips] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)
