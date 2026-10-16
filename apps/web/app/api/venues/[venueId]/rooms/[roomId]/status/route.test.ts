import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  personId: vi.fn(),
  requireVenue: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
  getRoom: vi.fn(),
  emit: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/sse/venue-events", () => ({ venueEventBus: { emit: m.emit } }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  getValidXvmApiPersonId: m.personId,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({
  createReservation: m.reserve,
  releaseRoom: m.release,
  getRoom: m.getRoom,
}))

import { PATCH } from "./route"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string; roomId: string }> }) => Promise<Response>
const patch = (body: unknown, roomId = "4") =>
  (PATCH as unknown as Handler)(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ venueId: "gilded-lily", roomId }),
  })

const room = {
  id: 4,
  name: "Suite",
  status: "reserved",
  updated_at: "2026-10-16T18:00:00Z",
  current_reservation: { id: 1 },
}

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.personId.mockResolvedValue(7)
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.reserve.mockResolvedValue({ id: 1 })
  m.getRoom.mockResolvedValue(room)
  m.release.mockResolvedValue({ id: 1, room_id: 4, ended_at: "2026-10-16T18:05:00Z" })
})

describe("room status", () => {
  it("reserves for the caller when the request names no one", async () => {
    expect((await patch({ action: "reserve" })).status).toBe(200)
    expect(m.reserve).toHaveBeenCalledWith(
      "tok",
      "ven_1",
      4,
      expect.objectContaining({ reserved_person_id: 7, reserved_character_name: null })
    )
  })

  it("does not add the caller when a character name is given", async () => {
    await patch({ action: "reserve", reserved_character_name: "Mira" })
    expect(m.reserve).toHaveBeenCalledWith("tok", "ven_1", 4, expect.objectContaining({ reserved_person_id: null }))
  })

  it("reserves a room and publishes the change under the xvm-api venue id the stream subscribes with", async () => {
    const res = await patch({ action: "reserve", reserved_character_name: "Mira" })
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.reserve).toHaveBeenCalledWith("tok", "ven_1", 4, expect.objectContaining({ reserved_character_name: "Mira" }))
    expect(m.emit).toHaveBeenCalledWith(
      "ven_1",
      expect.objectContaining({ type: "room_status", venueId: "ven_1", data: expect.objectContaining({ roomId: 4, isOccupied: true }) })
    )
  })

  it("releases a room and publishes the re-read room as vacant, since xvm-api's release returns a reservation, not the room", async () => {
    m.getRoom.mockResolvedValue({ ...room, status: "available", current_reservation: null })
    const res = await patch({ action: "release" })
    expect(res.status).toBe(200)
    expect(m.release).toHaveBeenCalledWith("tok", "ven_1", 4)
    expect(m.getRoom).toHaveBeenCalledWith("tok", "ven_1", 4)
    expect(m.emit).toHaveBeenCalledWith("ven_1", expect.objectContaining({ data: expect.objectContaining({ isOccupied: false }) }))
  })

  it("answers 404 for a venue the caller cannot see, without changing or publishing anything", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await patch({ action: "release" })).status).toBe(404)
    expect(m.release).not.toHaveBeenCalled()
    expect(m.emit).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric room id before resolving the venue", async () => {
    expect((await patch({ action: "release" }, "abc")).status).toBe(400)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })

  it("rejects an unknown action", async () => {
    expect((await patch({ action: "demolish" })).status).toBe(400)
    expect(m.emit).not.toHaveBeenCalled()
  })
})
