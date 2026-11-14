import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { setAuditLogChannel } from "@/lib/api/xvm-api"
import { requireChannelInGuild } from "@/lib/api/venue-guild"
import { validators } from "@/lib/validation"

const settingsSchema = z.object({
  channelId: validators.snowflake.nullable(),
})

export const PUT = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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
    const lookup = await requireMyVenue(session.user.id, venueId, "[audit-log] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof settingsSchema>
    try {
      data = settingsSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    if (data.channelId) {
      const channel = await requireChannelInGuild(session.user.id, venueId, data.channelId)
      if (!channel.ok) return channel.response
    }

    try {
      return NextResponse.json(await setAuditLogChannel(token, lookup.venue.id, data.channelId))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[audit-log/settings] PUT error")
    }
  },
  { requests: 30, window: "1 m" }
)
