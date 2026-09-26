import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { syncFfxivListing } from "@/lib/api/xvm-api"

type Ctx = { params: Promise<{ venueId: string }> }

async function authorize(context: Ctx | undefined) {
  if (!context?.params) return { error: NextResponse.json({ error: "Invalid request" }, { status: 400 }) }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return { error: NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }) }

  const { venueId } = await context.params
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }

  return { error: null, userId: session.user.id, token, xvmApiVenueId: venue.xvmApiVenueId }
}

export const POST = withRateLimit<Ctx>(
  async (_request, context) => {
    const auth = await authorize(context)
    if (auth.error) return auth.error

    try {
      return NextResponse.json(await syncFfxivListing(auth.token, auth.xvmApiVenueId))
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[ffxivvenues sync] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
