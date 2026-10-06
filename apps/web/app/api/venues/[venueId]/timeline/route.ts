import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import {
  getEvent,
  listFinanceTransactions,
  listMemberships,
  listPatronLogs,
  listShifts,
  type FinanceTransactionRow,
  type MembershipRow,
  type PatronLogRow,
  type ShiftRow,
} from "@/lib/api/xvm-api"
import { patronItems, saleItems, shiftItems, type TimelineApiItem } from "@/lib/timeline-items"

const TIMELINE_WINDOW_MS = 59 * 24 * 60 * 60 * 1000

export async function GET(request: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { venueId } = await params
  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get("cursor")
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
  const type = searchParams.get("type") // "sales" | "patrons" | "staff" | null (all)
  const eventId = searchParams.get("eventId") // filter to a specific event

  // Verify membership
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, venueId, status: "active" },
  })
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const items: TimelineApiItem[] = []

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  const readXvm = await xvmPageReader(session.user.id, venue?.xvmApiVenueId ?? null)
  const windowTo = cursor ? new Date(cursor) : new Date()
  let windowFrom = new Date(windowTo.getTime() - TIMELINE_WINDOW_MS)
  if (eventId) {
    const event = /^\d+$/.test(eventId)
      ? await readXvm("timeline event", null, (t, v) => getEvent(t, v, Number(eventId)))
      : null
    if (event && new Date(event.starts_at) > windowFrom) windowFrom = new Date(event.starts_at)
  }
  const range = { from: windowFrom.toISOString(), to: windowTo.toISOString() }
  const wantSales = !type || type === "sales"
  const wantShifts = !type || type === "staff"
  const wantPatrons = (!type || type === "patrons") && (!eventId || /^\d+$/.test(eventId))

  if (windowFrom < windowTo && (wantSales || wantShifts || wantPatrons)) {
    const [roster, transactions, shifts, patronLogs] = await Promise.all([
      readXvm("timeline roster", [] as MembershipRow[], (t, v) => listMemberships(t, v)),
      wantSales
        ? readXvm("timeline sales", [] as FinanceTransactionRow[], (t, v) => listFinanceTransactions(t, v, range))
        : Promise.resolve([] as FinanceTransactionRow[]),
      wantShifts
        ? readXvm("timeline shifts", [] as ShiftRow[], (t, v) => listShifts(t, v, range))
        : Promise.resolve([] as ShiftRow[]),
      wantPatrons
        ? readXvm("timeline patrons", [] as PatronLogRow[], (t, v) =>
            listPatronLogs(t, v, { ...range, eventId: eventId ? Number(eventId) : undefined, limit })
          )
        : Promise.resolve([] as PatronLogRow[]),
    ])
    const members = new Map(roster.map((m) => [m.id, m]))
    items.push(
      ...patronItems(patronLogs).filter((i) => i.timestamp >= windowFrom && i.timestamp < windowTo),
      ...saleItems(transactions, members),
      ...shiftItems(shifts, members).filter((i) => i.timestamp >= windowFrom && i.timestamp < windowTo)
    )
  }

  const trimmed = items
    .filter((i) => !cursor || i.timestamp < windowTo)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit)
  const nextCursor = trimmed.length === limit ? trimmed[trimmed.length - 1].timestamp.toISOString() : null

  return NextResponse.json({
    items: trimmed,
    nextCursor,
    hasMore: trimmed.length === limit,
  })
}
