import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ act: vi.fn() }))

vi.mock("@/lib/api/venue-action", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/venue-action")>()),
  withVenueAction: async (_venue: string, _label: string, run: (t: string, v: string) => Promise<Response>) =>
    run("tok", "ven_1"),
}))
vi.mock("@/lib/api/xvm-api", () => ({ cancelEventShift: m.act }))

import { POST } from "./route"

type Ctx = Parameters<typeof POST>[1]
const ctx = (eventShiftId = "20"): Ctx => ({ params: Promise.resolve({ venueId: "gilded-lily", eventShiftId }) })
const call = (body: unknown = { reason: "Rained out" }, eventShiftId?: string) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }), ctx(eventShiftId))

beforeEach(() => {
  vi.resetAllMocks()
  m.act.mockResolvedValue(undefined)
})

describe("cancel an event shift", () => {
  it("cancels the event shift with the reason", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(m.act).toHaveBeenCalledWith("tok", "ven_1", 20, "Rained out")
  })

  it("cancels without a reason", async () => {
    await call({})
    expect(m.act).toHaveBeenCalledWith("tok", "ven_1", 20, null)
  })

  it("rejects a reason over 200 characters", async () => {
    expect((await call({ reason: "x".repeat(201) })).status).toBe(400)
    expect(m.act).not.toHaveBeenCalled()
  })
})
