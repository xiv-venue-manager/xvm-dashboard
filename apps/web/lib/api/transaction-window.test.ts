import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ listFinanceTransactions: vi.fn() }))
vi.mock("@/lib/api/xvm-api", () => ({ listFinanceTransactions: m.listFinanceTransactions }))

import { listTransactionsInRange, MAX_TRANSACTION_RANGE_MS } from "./transaction-window"

const DAY = 24 * 60 * 60 * 1000
const to = new Date("2026-11-09T00:00:00.000Z")

beforeEach(() => {
  vi.resetAllMocks()
  m.listFinanceTransactions.mockResolvedValue([])
})

describe("listTransactionsInRange", () => {
  it("sends a range inside the cap as one request", async () => {
    await listTransactionsInRange("tok", "ven_1", new Date(to.getTime() - 30 * DAY), to, "sale")
    expect(m.listFinanceTransactions).toHaveBeenCalledTimes(1)
    expect(m.listFinanceTransactions).toHaveBeenCalledWith("tok", "ven_1", {
      from: new Date(to.getTime() - 30 * DAY).toISOString(),
      to: to.toISOString(),
      kind: "sale",
    })
  })

  it("splits 90 days into windows that meet end to end and none passes 59 days", async () => {
    const from = new Date(to.getTime() - 90 * DAY)
    await listTransactionsInRange("tok", "ven_1", from, to)
    const windows = m.listFinanceTransactions.mock.calls.map(([, , o]) => o as { from: string; to: string })
    expect(windows).toHaveLength(2)
    expect(windows[0].to).toBe(to.toISOString())
    expect(windows[0].from).toBe(windows[1].to)
    expect(windows[1].from).toBe(from.toISOString())
    for (const w of windows) expect(Date.parse(w.to) - Date.parse(w.from)).toBeLessThanOrEqual(59 * DAY)
  })

  it("keeps newest first across windows and counts a row on a shared edge once", async () => {
    m.listFinanceTransactions
      .mockResolvedValueOnce([{ id: 5 }, { id: 4 }])
      .mockResolvedValueOnce([{ id: 4 }, { id: 3 }])
    const rows = await listTransactionsInRange("tok", "ven_1", new Date(to.getTime() - 90 * DAY), to)
    expect(rows.map((r) => r.id)).toEqual([5, 4, 3])
  })

  it("allows a range of about three and a half years", () => {
    expect(MAX_TRANSACTION_RANGE_MS).toBeGreaterThan(1200 * DAY)
  })
})
