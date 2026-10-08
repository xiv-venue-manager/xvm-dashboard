import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  membership: vi.fn(),
  venue: vi.fn(),
  getEvent: vi.fn(),
  listPatronLogs: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({
  prisma: { membership: { findFirst: m.membership }, venue: { findUnique: m.venue } },
}))
vi.mock("@/lib/api/xvm-page-read", () => ({
  xvmPageReader: async () => (_label: string, _fallback: unknown, call: (t: string, v: string) => Promise<unknown>) =>
    call("tok", "xv-1"),
}))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  getEvent: m.getEvent,
  listPatronLogs: m.listPatronLogs,
  listMemberships: vi.fn().mockResolvedValue([]),
  listFinanceTransactions: vi.fn().mockResolvedValue([]),
  listShifts: vi.fn().mockResolvedValue([]),
}))

import { GET } from "./route"
import type { PatronLogRow } from "@/lib/api/xvm-api"

const get = (query: string) =>
  GET(new Request(`http://localhost/api/venues/v1/timeline?${query}`) as never, {
    params: Promise.resolve({ venueId: "v1" }),
  })
const minutesAgo = (n: number) => new Date(Date.now() - n * 60000).toISOString()
const row = (id: number, eventId: number | null, ago: number) =>
  ({ id, event_id: eventId, ts: minutesAgo(ago), action: "enter", count_change: 1, character_name: `C${id}`, world: "W" }) as unknown as PatronLogRow

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.membership.mockResolvedValue({ id: "m1" })
  m.venue.mockResolvedValue({ xvmApiVenueId: "xv-1" })
  m.getEvent.mockResolvedValue({ starts_at: minutesAgo(120), ends_at: minutesAgo(-60) })
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
