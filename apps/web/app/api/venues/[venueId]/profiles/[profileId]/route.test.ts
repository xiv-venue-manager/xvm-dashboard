import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.lookup }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  updateProfile: m.update,
  deleteProfile: m.remove,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.update.mockResolvedValue({ id: 5 })
  m.remove.mockResolvedValue(undefined)
})

import { PATCH, DELETE } from "./route"

const context = (profileId = "5") => ({ params: Promise.resolve({ venueId: "vn_1", profileId }) })
const patch = (body: unknown, profileId?: string) =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }) as never, context(profileId) as never)

describe("PATCH /api/venues/[venueId]/profiles/[profileId]", () => {
  it("maps camelCase fields to xvm-api's snake_case names", async () => {
    const res = await patch({
      characterName: "Aeris",
      color: 0x4abc23,
      dataCenter: "aether",
      world: "Gilgamesh",
      pronouns: "she,her",
      genderCustom: "Fluid",
      pairingCodeType: "mare",
      pairingCode: "ABC",
      aboutMe: "Hello",
    })
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 5, {
      character_name: "Aeris",
      color: 0x4abc23,
      data_center: "aether",
      world: "Gilgamesh",
      pronouns: "she,her",
      gender_custom: "Fluid",
      pairing_code_type: "mare",
      pairing_code: "ABC",
      about_me: "Hello",
    })
  })

  it("clears a blank field with null and the colour with null", async () => {
    await patch({ rates: "   ", color: null })
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 5, { rates: null, color: null })
  })

  it("rejects an empty body, an over-long field and a bad id", async () => {
    expect((await patch({})).status).toBe(400)
    expect((await patch({ aboutMe: "x".repeat(3001) })).status).toBe(400)
    expect((await patch({ jobs: "Bard" }, "abc")).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/venues/[venueId]/profiles/[profileId]", () => {
  it("deletes the sheet and answers 204", async () => {
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context() as never)
    expect(res.status).toBe(204)
    expect(m.remove).toHaveBeenCalledWith("tok", "xv-1", 5)
  })
})
