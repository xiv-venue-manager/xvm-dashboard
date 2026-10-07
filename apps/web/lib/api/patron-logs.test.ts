import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }))

vi.mock("@/lib/api/xvm-api", () => ({ listPatronLogs: mockList }))

import { listAllPatronLogs } from "./patron-logs"
import type { PatronLogRow } from "@/lib/api/xvm-api"

const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ id: from - i }) as PatronLogRow)

beforeEach(() => vi.resetAllMocks())

describe("listAllPatronLogs", () => {
  it("asks for pages below the API's 200 row cap", async () => {
    mockList.mockResolvedValue([])
    await listAllPatronLogs("tok", "xv-1", { eventId: 4 })
    expect(mockList.mock.calls[0][2].limit).toBeLessThan(200)
  })

  it("follows the cursor until a short page and returns every row", async () => {
    mockList.mockImplementation(async (_t: string, _v: string, opts: { before?: number }) => {
      if (opts.before === undefined) return page(500, 199)
      return opts.before === 302 ? page(301, 199) : page(102, 40)
    })
    const rows = await listAllPatronLogs("tok", "xv-1", { from: "a", to: "b", classification: "patron" })
    expect(rows).toHaveLength(199 + 199 + 40)
    expect(mockList.mock.calls.map((c) => c[2].before)).toEqual([undefined, 302, 103])
    expect(mockList.mock.calls[0][2]).toMatchObject({ from: "a", to: "b", classification: "patron" })
  })

  it("stops after a single short page", async () => {
    mockList.mockResolvedValue(page(10, 3))
    expect(await listAllPatronLogs("tok", "xv-1", { eventId: 1 })).toHaveLength(3)
    expect(mockList).toHaveBeenCalledTimes(1)
  })
})
