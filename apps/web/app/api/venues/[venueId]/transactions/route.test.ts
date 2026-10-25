import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  withVenueAction: vi.fn(),
  session: vi.fn(),
  listFinanceTransactions: vi.fn(),
  createTransaction: vi.fn(),
  InsufficientStockError: class InsufficientStockError extends Error {},
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-action", () => ({ withVenueAction: m.withVenueAction }))
vi.mock("@/lib/api/xvm-api", () => ({ listFinanceTransactions: m.listFinanceTransactions }))
vi.mock("@/lib/api/transactions", async () => {
  const { z } = await import("zod")
  return {
    createTransaction: m.createTransaction,
    InsufficientStockError: m.InsufficientStockError,
    createTransactionSchema: z.object({ type: z.enum(["SALE", "TIP"]), amount: z.number(), customerName: z.string() }),
  }
})

import { GET, POST } from "./route"

const context = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const get = (query = "") => new NextRequest(`http://localhost/x${query}`)
const post = (body: unknown) =>
  new NextRequest("http://localhost/x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) })

beforeEach(() => {
  vi.resetAllMocks()
  m.withVenueAction.mockImplementation((_slug, _label, run) => run("tok", "ven_1"))
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.listFinanceTransactions.mockResolvedValue([])
})

describe("transactions GET", () => {
  it("lists the window under the xvm-api venue id", async () => {
    const res = await GET(get("?kind=tip&startDate=2026-10-01T00:00:00Z&endDate=2026-10-08T00:00:00Z"), context)
    expect(await res.json()).toEqual({ transactions: [], nextCursor: null, hasMore: false })
    expect(m.listFinanceTransactions).toHaveBeenCalledWith("tok", "ven_1", {
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-08T00:00:00.000Z",
      kind: "tip",
    })
  })

  it.each([["?kind=bogus"], ["?startDate=nope"], ["?endDate=nope"], ["?startDate=2026-10-08&endDate=2026-10-01"]])(
    "refuses %s",
    async (query) => {
      const res = await GET(get(query), context)
      expect(res.status).toBe(400)
      expect(m.listFinanceTransactions).not.toHaveBeenCalled()
    }
  )

  it("judges the query only after the venue gate lets the caller in", async () => {
    m.withVenueAction.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    const res = await GET(get("?kind=bogus"), context)
    expect(res.status).toBe(401)
  })
})

describe("transactions POST", () => {
  const sale = { type: "SALE", amount: 4500, customerName: "Bob" }

  it("records the sale with the gate's token and venue id", async () => {
    m.createTransaction.mockResolvedValue({ id: 7 })
    const res = await POST(post(sale), context)
    expect(res.status).toBe(201)
    expect(m.createTransaction).toHaveBeenCalledWith("tok", "ven_1", "u1", sale)
  })

  it.each([["not json"], [{ type: "SALE" }]])("refuses a bad body: %j", async (body) => {
    const res = await POST(post(body), context)
    expect(res.status).toBe(400)
    expect(m.createTransaction).not.toHaveBeenCalled()
  })

  it("turns an out-of-stock refusal into a 409", async () => {
    m.createTransaction.mockRejectedValue(new m.InsufficientStockError("Potion is out of stock"))
    const res = await POST(post(sale), context)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Potion is out of stock")
  })

  it("rethrows other failures to the venue gate", async () => {
    m.createTransaction.mockRejectedValue(new Error("boom"))
    await expect(POST(post(sale), context)).rejects.toThrow("boom")
  })
})
