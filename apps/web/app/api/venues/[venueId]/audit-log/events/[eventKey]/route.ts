import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { configureAuditLogEvent, stopAuditLogEvent } from "@/lib/api/xvm-api"
import { AUDIT_LOG_EVENT_KEYS } from "@/lib/audit-log-events"

const eventKeySchema = z.enum(AUDIT_LOG_EVENT_KEYS)
const configureSchema = z.object({
  color: z.number().int().min(0).max(0xffffff).nullable(),
})

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; eventKey: string }> }>(
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

    const { venueId, eventKey } = await context.params
    const key = eventKeySchema.safeParse(eventKey)
    if (!key.success) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[audit-log] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof configureSchema>
    try {
      data = configureSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(await configureAuditLogEvent(token, lookup.venue.id, key.data, data.color))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[audit-log/events/:key] PUT error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; eventKey: string }> }>(
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

    const { venueId, eventKey } = await context.params
    const key = eventKeySchema.safeParse(eventKey)
    if (!key.success) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[audit-log] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await stopAuditLogEvent(token, lookup.venue.id, key.data)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[audit-log/events/:key] DELETE error")
    }
  },
  { requests: 60, window: "1 m" }
)
