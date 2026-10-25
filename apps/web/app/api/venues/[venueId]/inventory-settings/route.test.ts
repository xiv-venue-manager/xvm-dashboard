import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  withVenueAction: vi.fn(),
  listModules: vi.fn(),
  setModule: vi.fn(),
}))

vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-action", () => ({ withVenueAction: m.withVenueAction }))
vi.mock("@/lib/api/xvm-api", () => ({
  listModules: m.listModules,
  setModule: m.setModule,
  XvmApiError: class XvmApiError extends Error {
    constructor(public status: number, public body: string) {
      super(`xvm-api ${status}: ${body}`)
    }
  },
}))

import { GET, PUT } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

const context = { params: Promise.resolve({ venueId: "gilded-lily" }) }

function put(body: unknown) {
  return new NextRequest("http://localhost/api/venues/gilded-lily/inventory-settings", {
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  m.withVenueAction.mockImplementation((_slug, _label, run) => run("tok", "ven_1"))
})

describe("inventory-settings GET", () => {
  it("reads the inventory module", async () => {
    m.listModules.mockResolvedValue([
      { module: "payroll", enabled: false },
      { module: "inventory", enabled: true },
    ])
    const res = await GET(new NextRequest("http://localhost/x"), context)
    expect(await res.json()).toEqual({ settings: { enabled: true } })
    expect(m.listModules).toHaveBeenCalledWith("tok", "ven_1")
  })

  it("reports disabled when xvm-api does not list the module", async () => {
    m.listModules.mockResolvedValue([])
    const res = await GET(new NextRequest("http://localhost/x"), context)
    expect(await res.json()).toEqual({ settings: { enabled: false } })
  })
})

describe("inventory-settings PUT", () => {
  it("toggles the inventory module", async () => {
    m.setModule.mockResolvedValue({ module: "inventory", enabled: true })
    const res = await PUT(put({ enabled: true }), context)
    expect(await res.json()).toEqual({ settings: { enabled: true } })
    expect(m.setModule).toHaveBeenCalledWith("tok", "ven_1", "inventory", true)
  })

  it("keeps the owners-and-managers message when xvm-api refuses staff", async () => {
    m.setModule.mockRejectedValue(new XvmApiError(403, "Insufficient role for this action."))
    const res = await PUT(put({ enabled: true }), context)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe("Only owners and managers can change inventory settings")
  })

  it("rethrows other xvm-api failures to the venue gate", async () => {
    m.setModule.mockRejectedValue(new XvmApiError(500, "boom"))
    await expect(PUT(put({ enabled: true }), context)).rejects.toThrow("xvm-api 500")
  })

  it.each([["not json"], [{ enabled: "yes" }], [{}]])("refuses a bad body: %j", async (body) => {
    const res = await PUT(put(body), context)
    expect(res.status).toBe(400)
    expect(m.setModule).not.toHaveBeenCalled()
  })

  it("judges the body only after the venue gate lets the caller in", async () => {
    m.withVenueAction.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    const res = await PUT(put("not json"), context)
    expect(res.status).toBe(401)
  })
})
