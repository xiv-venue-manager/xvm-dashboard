import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { banPatron, unbanPatron } from "@/lib/api/xvm-api"

const setBanSchema = z
  .object({
    isBanned: z.boolean(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((d) => !d.isBanned || !!d.reason, {
    message: "reason is required when banning a patron",
    path: ["reason"],
  })

function parsePatronId(patronId: string) {
  const id = Number(patronId)
  return Number.isInteger(id) ? id : null
}

export const PATCH = withRateLimit<{
  params: Promise<{ venueId: string; patronId: string }>
}>(
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

    const { venueId, patronId } = await context.params
    const id = parsePatronId(patronId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid patron id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[patrons/:id/ban] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof setBanSchema>
    try {
      data = setBanSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const patron = data.isBanned
        ? await banPatron(token, lookup.venue.id, id, data.reason!)
        : await unbanPatron(token, lookup.venue.id, id)
      return NextResponse.json({ id: patron.id, isBanned: patron.is_banned })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[patrons/:id/ban] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)
