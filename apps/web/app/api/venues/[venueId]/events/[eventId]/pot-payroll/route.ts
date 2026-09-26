import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { generatePot, previewPot } from "@/lib/api/xvm-api"

type RouteContext = { params: Promise<{ venueId: string; eventId: string }> }

async function authorize(context: RouteContext | undefined) {
  if (!context?.params) {
    return { error: NextResponse.json({ error: "Invalid request" }, { status: 400 }) }
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    return { error: NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }) }
  }

  const { venueId, eventId } = await context.params
  if (!/^\d+$/.test(eventId)) {
    return { error: NextResponse.json({ error: "Event not found" }, { status: 404 }) }
  }

  const venue = await prisma.venue.findFirst({
    where: { OR: [{ id: venueId }, { slug: venueId }] },
    select: { xvmApiVenueId: true },
  })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }

  return { userId: session.user.id, token, xvmApiVenueId: venue.xvmApiVenueId, eventId: Number(eventId) }
}

export const GET = withRateLimit<RouteContext>(
  async (_request, context) => {
    const auth = await authorize(context)
    if (auth.error) return auth.error

    try {
      return NextResponse.json({ preview: await previewPot(auth.token, auth.xvmApiVenueId, auth.eventId) })
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[pot-payroll] preview error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<RouteContext>(
  async (_request, context) => {
    const auth = await authorize(context)
    if (auth.error) return auth.error

    try {
      return NextResponse.json(
        { distribution: await generatePot(auth.token, auth.xvmApiVenueId, auth.eventId) },
        { status: 201 }
      )
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[pot-payroll] generate error")
    }
  },
  { requests: 5, window: "1 m" }
)
