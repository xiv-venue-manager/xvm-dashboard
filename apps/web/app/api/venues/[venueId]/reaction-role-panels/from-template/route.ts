import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { applyPanelTemplate } from "@/lib/api/xvm-api"
import { requireChannelInGuild } from "@/lib/api/venue-guild"
import { validators } from "@/lib/validation"

const applyTemplateSchema = z.object({
  templateId: z.number().int().positive(),
  channelId: validators.snowflake,
})

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

    const lookup = await requireMyVenue(session.user.id, venueId, "[reaction-role-panels] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof applyTemplateSchema>
    try {
      data = applyTemplateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const channel = await requireChannelInGuild(session.user.id, venueId, data.channelId)
    if (!channel.ok) return channel.response

    try {
      // 202, no body - the bot builds the panel. See lib/api/xvm-api.ts's applyPanelTemplate.
      await applyPanelTemplate(token, lookup.venue.id, {
        template_id: data.templateId,
        channel_id: data.channelId,
      })
      return NextResponse.json({ accepted: true }, { status: 202 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/from-template] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
