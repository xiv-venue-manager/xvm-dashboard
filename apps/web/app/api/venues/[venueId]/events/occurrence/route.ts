import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { materializeEvent, XvmApiError } from "@/lib/api/xvm-api"

const redirectTo = (path: string) => new NextResponse(null, { status: 307, headers: { Location: path } })

export async function GET(request: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
  }

  const { venueId } = await params
  const { searchParams } = new URL(request.url)
  const rule = searchParams.get("rule") ?? ""
  const at = searchParams.get("at") ?? ""
  const to = searchParams.get("to")
  if (!/^\d+$/.test(rule) || Number.isNaN(new Date(at).getTime())) {
    return NextResponse.json({ error: "rule and at are required" }, { status: 400 })
  }

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { slug: true, xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return NextResponse.json(
      { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
      { status: 409 }
    )
  }

  const events = `/dashboard/${venue.slug}/events`
  try {
    const row = await materializeEvent(token, venue.xvmApiVenueId, {
      recurrence_rule_id: Number(rule),
      scheduled_at: new Date(at).toISOString(),
    })
    return redirectTo(`${events}/${row.id}${to === "edit" ? "/edit" : ""}`)
  } catch (err) {
    if (err instanceof XvmApiError && [400, 403, 404, 409].includes(err.status)) return redirectTo(events)
    return xvmApiErrorResponse(err, session.user.id, "[events] materialize occurrence error")
  }
}
