import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { createAutoReactorRule, listAutoReactorRules } from "@/lib/api/xvm-api"
import { requireChannelInGuild } from "@/lib/api/venue-guild"
import { validators } from "@/lib/validation"

const createRuleSchema = z.object({
  channelId: validators.snowflake.nullable().optional(),
  keyword: z.string().trim().min(1).max(100).nullable().optional(),
  roleId: validators.snowflake.nullable().optional(),
  emoji: z.string().trim().min(1).max(100),
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

    const { venueId } = await context.params
    const lookup = await requireMyVenue(session.user.id, venueId, "[auto-reactor] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      return NextResponse.json(await listAutoReactorRules(token, lookup.venue.id))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[auto-reactor/rules] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

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
    const lookup = await requireMyVenue(session.user.id, venueId, "[auto-reactor] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof createRuleSchema>
    try {
      data = createRuleSchema.parse(await request.json())
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
      const rule = await createAutoReactorRule(token, lookup.venue.id, {
        ...(data.channelId !== undefined && { channel_id: data.channelId }),
        ...(data.keyword !== undefined && { keyword: data.keyword }),
        ...(data.roleId !== undefined && { role_id: data.roleId }),
        emoji: data.emoji,
      })
      return NextResponse.json(rule, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[auto-reactor/rules] POST error")
    }
  },
  { requests: 20, window: "1 m" }
)
