import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  venue: vi.fn(),
  membership: vi.fn(),
  token: vi.fn(),
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  createEventSeries: vi.fn(),
  visibility: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({
  prisma: { venue: { findUnique: m.venue }, membership: { findFirst: m.membership } },
}))
vi.mock("@/lib/event-visibility", () => ({ eventVisibilityFor: m.visibility }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/xvm-api")>()
  return { ...actual, listEvents: m.listEvents, createEvent: m.createEvent, createEventSeries: m.createEventSeries }
})

import { GET, POST } from "./route"
import type { EventItem, EventRow } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const call = (handler: unknown, url = "http://localhost/api", body?: unknown) => {
  const req = new Request(url, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body) })
  return (handler as Handler)(Object.assign(req, { nextUrl: new URL(url) }), { params: Promise.resolve({ venueId: "venue-1" }) })
}

const future = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString()
const item = (overrides: Partial<EventItem> = {}): EventItem => ({
  materialized: true,
  id: 1,
  recurrence_rule_id: null,
  scheduled_at: null,
  title: "Karaoke",
  description: null,
  event_type: "PERFORMANCE",
  location: null,
  image_url: null,
  starts_at: future(24),
  ends_at: future(27),
  published_at: future(-1),
  cancelled_at: null,
  cancel_reason: null,
  ...overrides,
})
const eventRow = (): EventRow => ({
  id: 5,
  title: "Karaoke",
  description: null,
  event_type: "PERFORMANCE",
  location: null,
  image_url: null,
  starts_at: "2026-10-02T19:00:00.000Z",
  ends_at: "2026-10-02T22:00:00.000Z",
  scheduled_at: null,
  published_at: null,
  cancelled_at: null,
  cancel_reason: null,
  recurrence_rule_id: null,
  partake_event_id: null,
  created_by_person_id: 9,
  created_at: "2026-09-26T00:00:00Z",
  updated_at: "2026-09-26T00:00:00Z",
})

const form = {
  title: "Karaoke",
  eventType: "PERFORMANCE",
  startTime: "2026-10-02T19:00:00.000Z",
  endTime: "2026-10-02T22:00:00.000Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.venue.mockResolvedValue({ xvmApiVenueId: "xv-1", settings: null })
  m.membership.mockResolvedValue({ role: "OWNER" })
  m.visibility.mockResolvedValue("all")
})

describe("POST", () => {
  it("creates a single draft event", async () => {
    m.createEvent.mockResolvedValue(eventRow())
    const res = await call(POST, "http://localhost/api", form)
    expect(res.status).toBe(201)
    expect(m.createEvent).toHaveBeenCalledWith("tok", "xv-1", {
      title: "Karaoke",
      description: null,
      event_type: "PERFORMANCE",
      publish: false,
      starts_at: form.startTime,
      ends_at: form.endTime,
    })
    expect(m.createEventSeries).not.toHaveBeenCalled()
    expect((await res.json()).id).toBe("5")
  })

  it("creates a series and returns its seed when a recurrence rule is set", async () => {
    m.createEventSeries.mockResolvedValue({ rule: {}, seed: eventRow() })
    const res = await call(POST, "http://localhost/api", { ...form, status: "PUBLISHED", recurrenceRule: "WEEKLY" })
    expect(res.status).toBe(201)
    expect(m.createEventSeries).toHaveBeenCalledWith(
      "tok",
      "xv-1",
      expect.objectContaining({ interval: "weekly", weekday: 4, publish: true, anchor_date: "2026-10-02" })
    )
    expect(m.createEvent).not.toHaveBeenCalled()
  })

  it("rejects a bad date with a validation error before calling xvm-api", async () => {
    const res = await call(POST, "http://localhost/api", { ...form, startTime: "nope" })
    expect(res.status).toBe(400)
    expect(m.createEvent).not.toHaveBeenCalled()
  })
})

describe("GET", () => {
  it("defaults to a 60 day window around now and includes cancelled events", async () => {
    m.listEvents.mockResolvedValue([item()])
    const res = await call(GET)
    expect(res.status).toBe(200)
    const [, , params] = m.listEvents.mock.calls[0]
    expect(params.includeCancelled).toBe(true)
    const span = new Date(params.to).getTime() - new Date(params.from).getTime()
    expect(span).toBe(60 * 86400000)
  })

  it("filters by derived status", async () => {
    m.listEvents.mockResolvedValue([item({ id: 1 }), item({ id: 2, cancelled_at: future(-1) })])
    const res = await call(GET, "http://localhost/api?status=CANCELLED")
    const events = await res.json()
    expect(events.map((e: { id: string }) => e.id)).toEqual(["2"])
  })

  it("hides drafts from staff when visibility is published-only", async () => {
    m.membership.mockResolvedValue({ role: "STAFF" })
    m.visibility.mockResolvedValue("published")
    m.listEvents.mockResolvedValue([item({ id: 1 }), item({ id: 2, published_at: null })])
    const events = await (await call(GET)).json()
    expect(events.map((e: { id: string }) => e.id)).toEqual(["1"])
  })

  it("keeps virtual occurrences, which have no id yet", async () => {
    m.listEvents.mockResolvedValue([item({ id: null, materialized: false, recurrence_rule_id: 3 })])
    const events = await (await call(GET)).json()
    expect(events[0]).toMatchObject({ id: null, materialized: false, recurrenceRuleId: 3 })
  })

  it("returns 403 for a non-member without calling xvm-api", async () => {
    m.membership.mockResolvedValue(null)
    expect((await call(GET)).status).toBe(403)
    expect(m.listEvents).not.toHaveBeenCalled()
  })
})
