import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  access: vi.fn(),
  getEvent: vi.fn(),
  listPatronLogs: vi.fn(),
  listFinanceTransactions: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.access }))
vi.mock("@/lib/api/xvm-page-read", () => ({
  xvmPageReader: async () => (_label: string, _fallback: unknown, call: (t: string, v: string) => Promise<unknown>) =>
    call("tok", "xv-1"),
}))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  getEvent: m.getEvent,
  listPatronLogs: m.listPatronLogs,
  listMemberships: vi.fn().mockResolvedValue([]),
  listFinanceTransactions: m.listFinanceTransactions,
  listShifts: vi.fn().mockResolvedValue([]),
}))

import { NextResponse } from "next/server"
import { GET } from "./route"
import type { FinanceTransactionRow, PatronLogRow } from "@/lib/api/xvm-api"

const get = (query: string) =>
  GET(new Request(`http://localhost/api/venues/v1/timeline?${query}`) as never, {
    params: Promise.resolve({ venueId: "v1" }),
  })
const minutesAgo = (n: number) => new Date(Date.now() - n * 60000).toISOString()
const txn = (id: number, kind: string, ago: number) =>
  ({ id, kind, amount: 100, created_at: minutesAgo(ago), membership_id: null, service_id: null, customer_name: null, notes: null }) as unknown as FinanceTransactionRow
const row = (id: number, eventId: number | null, ago: number) =>
  ({ id, event_id: eventId, ts: minutesAgo(ago), action: "enter", count_change: 1, character_name: `C${id}`, world: "W" }) as unknown as PatronLogRow

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.access.mockResolvedValue({ ok: true, venue: { id: "xv-1", role: "STAFF" } })
  m.listFinanceTransactions.mockResolvedValue([])
  m.getEvent.mockResolvedValue({ starts_at: minutesAgo(120), ends_at: minutesAgo(-60) })
})

describe("GET timeline sale items", () => {
  it("asks xvm-api for one page of sales, not the whole window", async () => {
    m.listFinanceTransactions.mockResolvedValue([])
    await get("type=sales&limit=20")
    expect(m.listFinanceTransactions.mock.calls[0][2]).toMatchObject({ limit: 20 })
  })

  it("keeps paging past expenses until it has a page of sales, so more can still be loaded", async () => {
    m.listFinanceTransactions
      .mockResolvedValueOnce([txn(9, "expense", 1), txn(8, "payout", 2), txn(7, "sale", 3)])
      .mockResolvedValueOnce([txn(6, "sale", 4), txn(5, "sale", 5), txn(4, "sale", 6)])
    const body = await (await get("type=sales&limit=3")).json()
    expect(m.listFinanceTransactions.mock.calls[1][2]).toMatchObject({ limit: 3, beforeId: 7 })
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["sale_7", "sale_6", "sale_5"])
    expect(body.hasMore).toBe(true)
  })

  it("stops when the list runs out, without reporting more", async () => {
    m.listFinanceTransactions.mockResolvedValueOnce([txn(3, "expense", 1), txn(2, "sale", 2)])
    const body = await (await get("type=sales&limit=3")).json()
    expect(m.listFinanceTransactions).toHaveBeenCalledTimes(1)
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["sale_2"])
    expect(body.hasMore).toBe(false)
  })
})

describe("GET timeline patron items", () => {
  it("asks xvm-api for the window only, so paging stays window-based", async () => {
    m.listPatronLogs.mockResolvedValue([])
    await get("type=patrons&eventId=7&limit=20")
    const opts = m.listPatronLogs.mock.calls[0][2]
    expect(opts).not.toHaveProperty("eventId")
    expect(opts).toMatchObject({ limit: 20 })
    expect(opts.from).toBeTruthy()
    expect(opts.to).toBeTruthy()
  })

  it("keeps only the requested event's rows when an event is given", async () => {
    m.listPatronLogs.mockResolvedValue([row(1, 7, 10), row(2, 8, 20), row(3, null, 30), row(4, 7, 40)])
    const body = await (await get("type=patrons&eventId=7")).json()
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["patron_1", "patron_4"])
  })

  it("returns every row in the window when no event is given", async () => {
    m.listPatronLogs.mockResolvedValue([row(1, 7, 10), row(2, 8, 20), row(3, null, 30)])
    const body = await (await get("type=patrons")).json()
    expect(body.items).toHaveLength(3)
  })

  it("stops the window at the event's end, so rows after closing cannot crowd the page out", async () => {
    const endsAt = minutesAgo(30)
    m.getEvent.mockResolvedValue({ starts_at: minutesAgo(180), ends_at: endsAt })
    m.listPatronLogs.mockResolvedValue([])
    await get("type=patrons&eventId=7&limit=50")
    expect(m.listPatronLogs.mock.calls[0][2].to).toBe(endsAt)
  })

  it("leaves the window ending now while the event is still running", async () => {
    m.listPatronLogs.mockResolvedValue([])
    const before = Date.now()
    await get("type=patrons&eventId=7")
    const to = new Date(m.listPatronLogs.mock.calls[0][2].to).getTime()
    expect(to).toBeGreaterThanOrEqual(before)
    expect(to).toBeLessThanOrEqual(Date.now())
  })

  it("keeps an earlier cursor as the upper bound", async () => {
    m.getEvent.mockResolvedValue({ starts_at: minutesAgo(180), ends_at: minutesAgo(30) })
    m.listPatronLogs.mockResolvedValue([])
    const cursor = minutesAgo(60)
    await get(`type=patrons&eventId=7&cursor=${encodeURIComponent(cursor)}`)
    expect(m.listPatronLogs.mock.calls[0][2].to).toBe(cursor)
  })

  it("does not read patron logs for a legacy non-numeric event id", async () => {
    await get("type=patrons&eventId=cm1abc")
    expect(m.listPatronLogs).not.toHaveBeenCalled()
  })
})

describe("GET timeline access", () => {
  it("returns the lookup's refusal for a venue the caller is not in, without asking xvm-api for anything", async () => {
    m.access.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Venue not found" }, { status: 404 }) })
    const res = await get("")
    expect(res.status).toBe(404)
    expect(m.listPatronLogs).not.toHaveBeenCalled()
  })
})
