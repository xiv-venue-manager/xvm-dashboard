import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { deleteSticky, updateSticky } from "@/lib/api/xvm-api"
import { stickyBodySchema } from "@/lib/sticky-draft"

const patchSchema = stickyBodySchema.partial()

function parseStickyId(stickyId: string) {
  const id = Number(stickyId)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; stickyId: string }> }>(
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

    const { venueId, stickyId } = await context.params
    const id = parseStickyId(stickyId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid sticky id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[sticky-messages] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof patchSchema>
    try {
      data = patchSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(await updateSticky(token, lookup.venue.id, id, data))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[sticky-messages/:id] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; stickyId: string }> }>(
  async (_request, context) => {
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

    const { venueId, stickyId } = await context.params
    const id = parseStickyId(stickyId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid sticky id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[sticky-messages] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deleteSticky(token, lookup.venue.id, id)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[sticky-messages/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
