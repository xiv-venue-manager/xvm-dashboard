import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ updateEventTemplate: m.update, deleteEventTemplate: m.remove }))

import { PATCH, DELETE } from "./route"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string; templateId: string }> }) => Promise<Response>
const ctx = (templateId = "4") => ({ params: Promise.resolve({ venueId: "gilded-lily", templateId }) })
const patch = (body: unknown, templateId?: string) =>
  (PATCH as unknown as Handler)(
    new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }),
    ctx(templateId)
  )
const del = (templateId?: string) =>
  (DELETE as unknown as Handler)(new Request("http://localhost/api", { method: "DELETE" }), ctx(templateId))

const row = {
  id: 4,
  name: "Karaoke night",
  title: "Karaoke",
  description: null,
  event_type: "SOCIAL",
  default_start_minute_of_day: 20 * 60,
  default_duration_minutes: 120,
}

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.update.mockResolvedValue(row)
  m.remove.mockResolvedValue(undefined)
})

describe("event-templates item", () => {
  it("updates a template against the venue resolved from the caller's xvm-api venues", async () => {
    const res = await patch({ name: "Karaoke night" })
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.update).toHaveBeenCalledWith("tok", "ven_1", 4, { name: "Karaoke night" })
  })

  it("converts a start and end time into a start minute and duration", async () => {
    await patch({ defaultStartTime: "20:00", defaultEndTime: "22:00" })
    expect(m.update).toHaveBeenCalledWith("tok", "ven_1", 4, {
      default_start_minute_of_day: 1200,
      default_duration_minutes: 120,
    })
  })

  it("rejects changing only one of the start and end times", async () => {
    const res = await patch({ defaultStartTime: "20:00" })
    expect(res.status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("deletes a template", async () => {
    const res = await del()
    expect(res.status).toBeLessThan(300)
    expect(m.remove).toHaveBeenCalledWith("tok", "ven_1", 4)
  })

  it("answers 404 for a venue the caller cannot see, on both update and delete", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await patch({ name: "x" })).status).toBe(404)
    expect((await del()).status).toBe(404)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.remove).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric template id before resolving the venue", async () => {
    expect((await patch({ name: "x" }, "abc")).status).toBe(400)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })
})
