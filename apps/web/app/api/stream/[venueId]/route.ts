import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { venueEventBus, type VenueEvent } from "@/lib/sse/venue-events"
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import { getVenue, type RevenueVisibility, type SalesVisibility } from "@/lib/api/xvm-api"
import { outgoingEvent, type StreamViewer } from "@/lib/sse/sale-visibility"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { venueId } = await params

  // Verify membership
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, venueId, status: "active" },
  })
  if (!membership) {
    return new Response("Forbidden", { status: 403 })
  }

  const isManager = membership.role === "OWNER" || membership.role === "MANAGER"
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  const readXvm = await xvmPageReader(session.user.id, venue?.xvmApiVenueId ?? null)
  const visibility = isManager
    ? { sales: "all" as SalesVisibility, revenue: "all" as RevenueVisibility }
    : await readXvm<{ sales: SalesVisibility; revenue: RevenueVisibility }>(
        "stream visibility",
        { sales: "none", revenue: "hide" },
        async (t, v) => {
          const detail = await getVenue(t, v)
          return { sales: detail.sales_visibility, revenue: detail.revenue_visibility }
        }
      )
  const viewer: StreamViewer = {
    userId: session.user.id,
    isManager,
    salesVisibility: visibility.sales,
    revenueVisibility: visibility.revenue,
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`))

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30000)

      // Subscribe to venue events
      const unsubscribe = venueEventBus.subscribe(venueId, (event: VenueEvent) => {
        const outgoing = outgoingEvent(viewer, event)
        if (!outgoing) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(outgoing)}\n\n`))
        } catch {
          // Client disconnected
          unsubscribe()
          clearInterval(heartbeat)
        }
      })

      // Cleanup on abort
      request.signal.addEventListener("abort", () => {
        unsubscribe()
        clearInterval(heartbeat)
        try {
          controller.close()
        } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
