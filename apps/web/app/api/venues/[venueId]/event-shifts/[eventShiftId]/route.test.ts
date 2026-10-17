import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ act: vi.fn() }))

vi.mock("@/lib/api/venue-action", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/venue-action")>()),
  withVenueAction: async (_venue: string, _label: string, run: (t: string, v: string) => Promise<Response>) =>
    run("tok", "ven_1"),
}))
vi.mock("@/lib/api/xvm-api", () => ({ deleteEventShift: m.act }))

import { DELETE } from "./route"

type Ctx = Parameters<typeof DELETE>[1]
const ctx = (eventShiftId = "20"): Ctx => ({ params: Promise.resolve({ venueId: "gilded-lily", eventShiftId }) })
const call = (eventShiftId?: string) =>
  DELETE(new Request("http://localhost/api", { method: "DELETE" }), ctx(eventShiftId))

beforeEach(() => {
  vi.resetAllMocks()
  m.act.mockResolvedValue(undefined)
})

describe("delete an event shift", () => {
  it("deletes the event shift", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(m.act).toHaveBeenCalledWith("tok", "ven_1", 20)
  })

  it("rejects a non-numeric id", async () => {
    expect((await call("abc")).status).toBe(404)
    expect(m.act).not.toHaveBeenCalled()
  })
})
