import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ act: vi.fn() }))

vi.mock("@/lib/api/venue-action", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/venue-action")>()),
  withVenueAction: async (_venue: string, _label: string, run: (t: string, v: string) => Promise<Response>) =>
    run("tok", "ven_1"),
}))
vi.mock("@/lib/api/xvm-api", () => ({ removeEventPosition: m.act }))

import { DELETE } from "./route"

type Ctx = Parameters<typeof DELETE>[1]
const ctx = (eventId = "9", eventPositionId = "3"): Ctx => ({
  params: Promise.resolve({ venueId: "gilded-lily", eventId, eventPositionId }),
})
const call = (eventId?: string, eventPositionId?: string) =>
  DELETE(new Request("http://localhost/api", { method: "DELETE" }), ctx(eventId, eventPositionId))

beforeEach(() => {
  vi.resetAllMocks()
  m.act.mockResolvedValue(undefined)
})

describe("remove a position from an event roster", () => {
  it("removes the position from the event", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(m.act).toHaveBeenCalledWith("tok", "ven_1", 9, 3)
  })

  it("rejects a non-numeric id", async () => {
    expect((await call("9", "abc")).status).toBe(404)
    expect(m.act).not.toHaveBeenCalled()
  })
})
