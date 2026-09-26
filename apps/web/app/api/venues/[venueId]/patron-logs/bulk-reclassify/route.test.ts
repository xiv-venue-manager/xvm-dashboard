import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), venue: vi.fn(), token: vi.fn(), reclassify: vi.fn() }))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findUnique: m.venue } } }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  reclassifyPatronLogs: m.reclassify,
}))

import { PATCH } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const call = (body: unknown) =>
  (PATCH as unknown as Handler)(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ venueId: "venue-1" }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.venue.mockResolvedValue({ xvmApiVenueId: "xv-1" })
  m.reclassify.mockResolvedValue({ updated: 2 })
})

describe("PATCH bulk-reclassify", () => {
  it("assigns logs to a staff member, converting the string ids to ints", async () => {
    const res = await call({ logIds: ["4", "5"], wasWorking: true, workingUserId: "9", reason: "on shift" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ updated: 2 })
    expect(m.reclassify).toHaveBeenCalledWith("tok", "xv-1", {
      log_ids: [4, 5],
      was_working: true,
      working_person_id: 9,
      reason: "on shift",
    })
  })

  it("moves logs back to patrons with no working person", async () => {
    await call({ logIds: ["4"], wasWorking: false, workingUserId: null })
    expect(m.reclassify).toHaveBeenCalledWith("tok", "xv-1", {
      log_ids: [4],
      was_working: false,
      working_person_id: null,
      reason: null,
    })
  })

  it("rejects staff assignment without a person and non-numeric ids before calling xvm-api", async () => {
    expect((await call({ logIds: ["4"], wasWorking: true, workingUserId: null })).status).toBe(400)
    expect((await call({ logIds: ["cmabc123"], wasWorking: false, workingUserId: null })).status).toBe(400)
    expect(m.reclassify).not.toHaveBeenCalled()
  })

  it("passes xvm-api's refusal for a non-manager through as a 403", async () => {
    m.reclassify.mockRejectedValue(new XvmApiError(403, JSON.stringify({ detail: "Manager tier required." })))
    const res = await call({ logIds: ["4"], wasWorking: false, workingUserId: null })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "Manager tier required." })
  })

  it("returns 409 for a venue that is not connected", async () => {
    m.venue.mockResolvedValue({ xvmApiVenueId: null })
    expect((await call({ logIds: ["4"], wasWorking: false, workingUserId: null })).status).toBe(409)
  })
})
