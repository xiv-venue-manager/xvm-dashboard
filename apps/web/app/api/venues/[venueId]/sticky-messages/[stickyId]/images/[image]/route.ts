import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { clearStickyImage, setStickyImage, type StickyImageSlot } from "@/lib/api/xvm-api"

const SLOTS: readonly string[] = ["header_icon", "footer_icon", "thumbnail", "image"]

type Context = { params: Promise<{ venueId: string; stickyId: string; image: string }> }

function parseStickyId(stickyId: string) {
  const id = Number(stickyId)
  return Number.isInteger(id) && id > 0 ? id : null
}

type Resolved =
  | { response: NextResponse }
  | { response?: undefined; userId: string; token: string; id: number; slot: StickyImageSlot; venueId: string }

async function resolve(context: Context | undefined): Promise<Resolved> {
  if (!context?.params) {
    return { response: NextResponse.json({ error: "Invalid request" }, { status: 400 }) }
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    return { response: NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }) }
  }

  const { venueId, stickyId, image } = await context.params
  const id = parseStickyId(stickyId)
  if (id === null) {
    return { response: NextResponse.json({ error: "Invalid sticky id" }, { status: 400 }) }
  }
  if (!SLOTS.includes(image)) {
    return { response: NextResponse.json({ error: "Invalid image slot" }, { status: 400 }) }
  }

  const lookup = await requireMyVenue(session.user.id, venueId, "[sticky-messages] /me/venues read error")
  if (!lookup.ok) return { response: lookup.response }

  return { userId: session.user.id, token, id, slot: image as StickyImageSlot, venueId: lookup.venue.id }
}

export const PUT = withRateLimit<Context>(
  async (request, context) => {
    const resolved = await resolve(context)
    if (resolved.response) return resolved.response

    const form = await request.formData().catch(() => null)
    const file = form?.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 })
    }

    try {
      return NextResponse.json(await setStickyImage(resolved.token, resolved.venueId, resolved.id, resolved.slot, file))
    } catch (err) {
      return xvmApiErrorResponse(err, resolved.userId, "[sticky-messages/:id/images/:image] PUT error")
    }
  },
  { requests: 10, window: "1 m" }
)

export const DELETE = withRateLimit<Context>(
  async (_request, context) => {
    const resolved = await resolve(context)
    if (resolved.response) return resolved.response

    try {
      await clearStickyImage(resolved.token, resolved.venueId, resolved.id, resolved.slot)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, resolved.userId, "[sticky-messages/:id/images/:image] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
