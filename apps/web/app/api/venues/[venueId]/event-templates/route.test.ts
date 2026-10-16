import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ listEventTemplates: m.list, createEventTemplate: m.create }))

import { GET, POST } from "./route"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const ctx = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const get = () => (GET as unknown as Handler)(new Request("http://localhost/api"), ctx)
const post = (body: unknown) =>
  (POST as unknown as Handler)(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }), ctx)

const row = {
  id: 4,
  name: "Karaoke night",
  title: "Karaoke",
  description: null,
  event_type: "SOCIAL",
  default_start_minute_of_day: 19 * 60,
  default_duration_minutes: 180,
}

const valid = { name: "Karaoke night", title: "Karaoke", eventType: "SOCIAL" }

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.list.mockResolvedValue([row])
  m.create.mockResolvedValue(row)
})

describe("event-templates collection", () => {
  it("lists templates for the venue resolved from the caller's xvm-api venues, in the dashboard shape", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.list).toHaveBeenCalledWith("tok", "ven_1")
    expect(await res.json()).toEqual([
      {
        id: "4",
        name: "Karaoke night",
        title: "Karaoke",
        description: null,
        eventType: "SOCIAL",
        defaultStartTime: "19:00",
        defaultEndTime: "22:00",
        createdBy: null,
      },
    ])
  })

  it("answers 404 for a venue the caller cannot see, before reading templates", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await get()).status).toBe(404)
    expect(m.list).not.toHaveBeenCalled()
  })

  it("rejects an unauthenticated request", async () => {
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })

  it("creates a template with the start minute and duration xvm-api stores", async () => {
    const res = await post({ ...valid, defaultStartTime: "19:00", defaultEndTime: "22:00" })
    expect(res.status).toBe(201)
    expect(m.create).toHaveBeenCalledWith("tok", "ven_1", {
      name: "Karaoke night",
      title: "Karaoke",
      description: null,
      event_type: "SOCIAL",
      default_start_minute_of_day: 1140,
      default_duration_minutes: 180,
    })
  })

  it("wraps an end time past midnight into the next day", async () => {
    await post({ ...valid, defaultStartTime: "23:00", defaultEndTime: "01:00" })
    expect(m.create).toHaveBeenCalledWith("tok", "ven_1", expect.objectContaining({ default_duration_minutes: 120 }))
  })

  it("rejects an invalid time before calling xvm-api", async () => {
    const res = await post({ ...valid, defaultStartTime: "7pm" })
    expect(res.status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })
})
