import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { setPanelThumbnail } from "@/lib/api/xvm-api"

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

function parsePanelId(panelId: string) {
  const id = Number(panelId)
  return Number.isInteger(id) ? id : null
}

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; panelId: string }> }>(
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

    const { venueId, panelId } = await context.params
    const id = parsePanelId(panelId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid panel id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 })
    }

    try {
      const panel = await setPanelThumbnail(token, gate.xvmApiVenueId!, id, file)
      return NextResponse.json(panel)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id/thumbnail] PUT error")
    }
  },
  { requests: 10, window: "1 m" }
)
