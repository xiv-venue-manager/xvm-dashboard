import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { deleteAutoReactorRule, updateAutoReactorRule } from "@/lib/api/xvm-api"
import { requireChannelInGuild } from "@/lib/api/venue-guild"
import { validators } from "@/lib/validation"

const updateRuleSchema = z.object({
  channelId: validators.snowflake.nullable().optional(),
  keyword: z.string().trim().min(1).max(100).nullable().optional(),
  roleId: validators.snowflake.nullable().optional(),
  emoji: z.string().trim().min(1).max(100).optional(),
})

function parseRuleId(ruleId: string) {
  const id = Number(ruleId)
  return Number.isInteger(id) ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; ruleId: string }> }>(
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

    const { venueId, ruleId } = await context.params
    const id = parseRuleId(ruleId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid rule id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[auto-reactor] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof updateRuleSchema>
    try {
      data = updateRuleSchema.parse(await request.json())
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
      const rule = await updateAutoReactorRule(token, lookup.venue.id, id, {
        ...(data.channelId !== undefined && { channel_id: data.channelId }),
        ...(data.keyword !== undefined && { keyword: data.keyword }),
        ...(data.roleId !== undefined && { role_id: data.roleId }),
        ...(data.emoji !== undefined && { emoji: data.emoji }),
      })
      return NextResponse.json(rule)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[auto-reactor/rules/:id] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; ruleId: string }> }>(
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

    const { venueId, ruleId } = await context.params
    const id = parseRuleId(ruleId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid rule id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[auto-reactor] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deleteAutoReactorRule(token, lookup.venue.id, id)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[auto-reactor/rules/:id] DELETE error")
    }
  },
  { requests: 20, window: "1 m" }
)
