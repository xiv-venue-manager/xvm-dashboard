import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }))

vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listFinanceTransactions: mockList,
}))

import { eventRevenueGil } from "./event-revenue"

const HOUR = 3600000
const row = (over: Record<string, unknown>) => ({ entry_type: "revenue", amount: 100, ...over })
const event = {
  id: "12",
  startTime: new Date("2026-10-03T19:00:00Z"),
  endTime: new Date("2026-10-03T22:00:00Z"),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockList.mockResolvedValue([])
})

describe("eventRevenueGil", () => {
  it("sums revenue rows and ignores expenses and payouts", async () => {
    mockList.mockResolvedValue([
      row({ amount: 4500 }),
      row({ amount: 500 }),
      row({ entry_type: "expense", amount: 900 }),
      row({ entry_type: "payout", amount: 300 }),
    ])
    expect(await eventRevenueGil("tok", "xv-1", event)).toBe(5000)
  })

  it("filters by event id over a window around the event", async () => {
    await eventRevenueGil("tok", "xv-1", event)
    const [, , opts] = mockList.mock.calls[0]
    expect(opts.eventId).toBe(12)
    expect(new Date(opts.from).getTime()).toBe(event.startTime.getTime() - 6 * HOUR)
    expect(new Date(opts.to).getTime()).toBe(event.endTime.getTime() + 12 * HOUR)
  })

  it("keeps the window inside the API's 60 day cap for a very long event", async () => {
    await eventRevenueGil("tok", "xv-1", { ...event, endTime: new Date(event.startTime.getTime() + 200 * 24 * HOUR) })
    const [, , opts] = mockList.mock.calls[0]
    expect(new Date(opts.to).getTime() - new Date(opts.from).getTime()).toBeLessThanOrEqual(59 * 24 * HOUR)
  })

  it("returns zero when nothing is attributed", async () => {
    expect(await eventRevenueGil("tok", "xv-1", event)).toBe(0)
  })
})
