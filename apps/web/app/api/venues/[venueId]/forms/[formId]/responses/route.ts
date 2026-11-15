import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { listFormResponses } from "@/lib/api/xvm-api"

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; formId: string }> }>(
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

    const { venueId, formId } = await context.params
    const formNum = parseId(formId)
    if (formNum === null) {
      return NextResponse.json({ error: "Invalid form id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[forms] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const url = new URL(request.url)
    const beforeParam = url.searchParams.get("beforeId")
    const beforeId = beforeParam === null ? undefined : parseId(beforeParam)
    if (beforeId === null) {
      return NextResponse.json({ error: "Invalid beforeId" }, { status: 400 })
    }

    try {
      return NextResponse.json(
        await listFormResponses(token, lookup.venue.id, formNum, {
          limit: 50,
          ...(beforeId !== undefined && { beforeId }),
        })
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[forms/:id/responses] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)
