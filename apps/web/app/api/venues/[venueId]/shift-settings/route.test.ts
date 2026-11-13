import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  withVenueAction: vi.fn(),
  getShiftSettings: vi.fn(),
  updateShiftSettings: vi.fn(),
}))

vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-action", () => ({ withVenueAction: m.withVenueAction }))
vi.mock("@/lib/api/xvm-api", () => ({
  getShiftSettings: m.getShiftSettings,
  updateShiftSettings: m.updateShiftSettings,
  XvmApiError: class XvmApiError extends Error {
    constructor(public status: number, public body: string) {
      super(`xvm-api ${status}: ${body}`)
    }
  },
}))

import { GET, PATCH } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

const context = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const settings = {
  approval_required: true,
  lockout_minutes: null,
  qualification_required: false,
  start_reminder_minutes: null,
}

function patch(body: unknown) {
  return new NextRequest("http://localhost/api/venues/gilded-lily/shift-settings", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  m.withVenueAction.mockImplementation((_slug, _label, run) => run("tok", "ven_1"))
})

describe("shift-settings GET", () => {
  it("maps approval_required to autoApprove", async () => {
    m.getShiftSettings.mockResolvedValue(settings)
    const res = await GET(new NextRequest("http://localhost/x"), context)
    expect(await res.json()).toEqual({ autoApprove: false })
    expect(m.getShiftSettings).toHaveBeenCalledWith("tok", "ven_1")
  })
})

describe("shift-settings PATCH", () => {
  it("turns auto-approval on and clears the backlog", async () => {
    m.updateShiftSettings.mockResolvedValue({ ...settings, approval_required: false })
    const res = await PATCH(patch({ enabled: true }), context)
    expect(await res.json()).toEqual({ autoApprove: true })
    expect(m.updateShiftSettings).toHaveBeenCalledWith(
      "tok",
      "ven_1",
      { approval_required: false },
      { approvePending: true }
    )
  })

  it("turns auto-approval off without clearing anything", async () => {
    m.updateShiftSettings.mockResolvedValue(settings)
    const res = await PATCH(patch({ enabled: false }), context)
    expect(await res.json()).toEqual({ autoApprove: false })
    expect(m.updateShiftSettings).toHaveBeenCalledWith(
      "tok",
      "ven_1",
      { approval_required: true },
      { approvePending: false }
    )
  })

  it.each([["not json"], [{ enabled: "yes" }], [{}]])("refuses a bad body: %j", async (body) => {
    const res = await PATCH(patch(body), context)
    expect(res.status).toBe(400)
    expect(m.updateShiftSettings).not.toHaveBeenCalled()
  })

  it("rethrows xvm-api failures to the venue gate", async () => {
    m.updateShiftSettings.mockRejectedValue(new XvmApiError(500, "boom"))
    await expect(PATCH(patch({ enabled: true }), context)).rejects.toThrow("xvm-api 500")
  })
})
