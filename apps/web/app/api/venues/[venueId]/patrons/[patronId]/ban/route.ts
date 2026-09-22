import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
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

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

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

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

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
        ? await banPatron(token, gate.xvmApiVenueId!, id, data.reason!)
        : await unbanPatron(token, gate.xvmApiVenueId!, id)
      return NextResponse.json({ id: patron.id, isBanned: patron.is_banned })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[patrons/:id/ban] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)
