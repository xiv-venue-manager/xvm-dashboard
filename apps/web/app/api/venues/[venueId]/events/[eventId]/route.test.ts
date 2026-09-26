import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  venue: vi.fn(),
  membership: vi.fn(),
  token: vi.fn(),
  getEvent: vi.fn(),
  updateEvent: vi.fn(),
  publishEvent: vi.fn(),
  cancelEvent: vi.fn(),
  deleteEvent: vi.fn(),
  listMemberships: vi.fn(),
  hidden: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({
  prisma: { venue: { findUnique: m.venue }, membership: { findFirst: m.membership } },
}))
vi.mock("@/lib/event-visibility", () => ({ eventHiddenFromStaff: m.hidden }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/xvm-api")>()
  return {
    ...actual,
    getEvent: m.getEvent,
    updateEvent: m.updateEvent,
    publishEvent: m.publishEvent,
    cancelEvent: m.cancelEvent,
    deleteEvent: m.deleteEvent,
    listMemberships: m.listMemberships,
  }
})

import { GET, PUT, DELETE } from "./route"
import { XvmApiError, type EventRow } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string; eventId: string }> }) => Promise<Response>
const call = (handler: unknown, eventId = "7", body?: unknown) =>
  (handler as Handler)(
    new Request("http://localhost/api", { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
    { params: Promise.resolve({ venueId: "venue-1", eventId }) }
  )

const future = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString()
const row = (overrides: Partial<EventRow> = {}): EventRow => ({
  id: 7,
  title: "Karaoke",
  description: null,
  event_type: "PERFORMANCE",
  location: null,
  image_url: null,
  starts_at: future(24),
  ends_at: future(27),
  scheduled_at: null,
  published_at: null,
  cancelled_at: null,
  cancel_reason: null,
  recurrence_rule_id: null,
  partake_event_id: null,
  created_by_person_id: 9,
  created_at: future(-1),
  updated_at: future(-1),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.venue.mockResolvedValue({ xvmApiVenueId: "xv-1", settings: null })
  m.membership.mockResolvedValue({ role: "OWNER" })
  m.hidden.mockResolvedValue(false)
  m.getEvent.mockResolvedValue(row())
})

describe("event id handling", () => {
  it("returns 404 for an old cuid id without calling xvm-api", async () => {
    const res = await call(GET, "cmabc123xyz")
    expect(res.status).toBe(404)
    expect(m.getEvent).not.toHaveBeenCalled()
  })

  it("returns 409 for a venue that is not connected", async () => {
    m.venue.mockResolvedValue({ xvmApiVenueId: null, settings: null })
    expect((await call(GET)).status).toBe(409)
  })
})

describe("GET", () => {
  it("returns the mapped event with the creator's roster name", async () => {
    m.listMemberships.mockResolvedValue([{ person: { id: 9, display_name: "Ehno" } }])
    const res = await call(GET)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: "7", status: "DRAFT", createdBy: { name: "Ehno" } })
  })

  it("still returns the event when the roster lookup fails", async () => {
    m.listMemberships.mockRejectedValue(new Error("down"))
    const res = await call(GET)
    expect(res.status).toBe(200)
    expect((await res.json()).createdBy).toBeNull()
  })

  it("hides a draft from staff when visibility is published-only", async () => {
    m.hidden.mockResolvedValue(true)
    expect((await call(GET)).status).toBe(404)
    expect(m.hidden).toHaveBeenCalledWith("user-1", "OWNER", expect.anything(), "DRAFT")
  })

  it("shows staff an in-progress event as published, not hidden by its derived ACTIVE status", async () => {
    m.getEvent.mockResolvedValue(row({ published_at: future(-3), starts_at: future(-1), ends_at: future(2) }))
    await call(GET)
    expect(m.hidden).toHaveBeenCalledWith("user-1", "OWNER", expect.anything(), "PUBLISHED")
  })
})

describe("PUT", () => {
  it("publishes a draft when status PUBLISHED is sent", async () => {
    m.publishEvent.mockResolvedValue(row({ published_at: future(-1) }))
    const res = await call(PUT, "7", { status: "PUBLISHED" })
    expect(res.status).toBe(200)
    expect(m.publishEvent).toHaveBeenCalledWith("tok", "xv-1", 7)
    expect(m.updateEvent).not.toHaveBeenCalled()
    expect((await res.json()).status).toBe("PUBLISHED")
  })

  it("cancels when status CANCELLED is sent", async () => {
    m.cancelEvent.mockResolvedValue(row({ cancelled_at: future(-1) }))
    const res = await call(PUT, "7", { status: "CANCELLED" })
    expect(m.cancelEvent).toHaveBeenCalledWith("tok", "xv-1", 7, { reason: null })
    expect((await res.json()).status).toBe("CANCELLED")
  })

  it("applies field edits and ignores an unchanged status echoed by the edit form", async () => {
    m.updateEvent.mockResolvedValue(row({ title: "New" }))
    const res = await call(PUT, "7", { title: "New", status: "DRAFT", eventType: "SOCIAL" })
    expect(res.status).toBe(200)
    expect(m.updateEvent).toHaveBeenCalledWith("tok", "xv-1", 7, { title: "New", event_type: "SOCIAL" })
    expect(m.publishEvent).not.toHaveBeenCalled()
    expect(m.cancelEvent).not.toHaveBeenCalled()
  })

  it("rejects an impossible status change before writing anything", async () => {
    m.getEvent.mockResolvedValue(row({ published_at: future(-1) }))
    const res = await call(PUT, "7", { title: "New", status: "DRAFT" })
    expect(res.status).toBe(400)
    expect(m.updateEvent).not.toHaveBeenCalled()
  })

  it("drops attendance and revenue instead of failing", async () => {
    m.updateEvent.mockResolvedValue(row({ title: "New" }))
    const res = await call(PUT, "7", { title: "New", attendanceCount: 5, revenue: 100 })
    expect(res.status).toBe(200)
    expect(m.updateEvent).toHaveBeenCalledWith("tok", "xv-1", 7, { title: "New" })
  })

  it("rejects an unparseable date with a validation error", async () => {
    const res = await call(PUT, "7", { startTime: "not a date" })
    expect(res.status).toBe(400)
  })
})

describe("DELETE", () => {
  it("deletes a draft", async () => {
    m.deleteEvent.mockResolvedValue(null)
    const res = await call(DELETE)
    expect(res.status).toBe(200)
    expect(m.deleteEvent).toHaveBeenCalledWith("tok", "xv-1", 7)
  })

  it("passes xvm-api's refusal to delete a published event through as a 409 with its message", async () => {
    m.deleteEvent.mockRejectedValue(new XvmApiError(409, JSON.stringify({ detail: "Cannot delete a published event." })))
    const res = await call(DELETE)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Cannot delete a published event." })
  })
})
