import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getFfxivLink, linkFfxivListing, unlinkFfxivListing } from "@/lib/api/xvm-api"

const linkSchema = z.object({ ffxivvenuesId: z.string().trim().min(1).max(64) }).strict()

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

export const GET = withRateLimit<Ctx>(
  async (_request, context) => {
    const auth = await authorize(context)
    if (auth.error) return auth.error

    try {
      return NextResponse.json(await getFfxivLink(auth.token, auth.xvmApiVenueId))
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[ffxivvenues link] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<Ctx>(
  async (request, context) => {
    const auth = await authorize(context)
    if (auth.error) return auth.error

    let data: z.infer<typeof linkSchema>
    try {
      data = linkSchema.parse(await request.json())
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(await linkFfxivListing(auth.token, auth.xvmApiVenueId, data.ffxivvenuesId))
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[ffxivvenues link] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)

export const DELETE = withRateLimit<Ctx>(
  async (_request, context) => {
    const auth = await authorize(context)
    if (auth.error) return auth.error

    try {
      await unlinkFfxivListing(auth.token, auth.xvmApiVenueId)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[ffxivvenues link] DELETE error")
    }
  },
  { requests: 10, window: "1 m" }
)
