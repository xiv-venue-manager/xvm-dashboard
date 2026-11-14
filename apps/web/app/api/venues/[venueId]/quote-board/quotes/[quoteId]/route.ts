import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { deleteQuote } from "@/lib/api/xvm-api"

function parseQuoteId(quoteId: string) {
  const id = Number(quoteId)
  return quoteId !== "" && Number.isInteger(id) && id > 0 ? id : null
}

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; quoteId: string }> }>(
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

    const { venueId, quoteId } = await context.params
    const id = parseQuoteId(quoteId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid quote id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[quote-board] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deleteQuote(token, lookup.venue.id, id)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[quote-board/quotes/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
