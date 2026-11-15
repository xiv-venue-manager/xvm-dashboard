import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { createLevelingRule } from "@/lib/api/xvm-api"
import { ruleCreateSchema } from "@/lib/leveling"

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
    const lookup = await requireMyVenue(session.user.id, venueId, "[leveling] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof ruleCreateSchema>
    try {
      data = ruleCreateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(
        await createLevelingRule(token, lookup.venue.id, {
          source_key: data.sourceKey,
          xp_amount: data.xpAmount,
          ...(data.cooldownSeconds !== undefined && { cooldown_seconds: data.cooldownSeconds }),
          ...(data.enabled !== undefined && { enabled: data.enabled }),
        }),
        { status: 201 }
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[leveling/rules] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)
