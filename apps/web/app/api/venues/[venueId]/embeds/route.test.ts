import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  create: vi.fn(),
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
  createEmbed: m.create,
}))

import { draftToBody, emptyDraft } from "@/lib/embed-draft"
import { POST } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.create.mockResolvedValue({ id: 9 })
})

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const post = (body: unknown) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

const valid = draftToBody({ ...emptyDraft, name: "Welcome", title: "Hello", color: "#ff8800", authorName: "Me" })

describe("POST /api/venues/[venueId]/embeds", () => {
  it("creates the embed under xvm-api's names", async () => {
    const res = await post(valid)
    expect(res.status).toBe(201)
    expect(m.create).toHaveBeenCalledWith(
      "tok",
      "xv-1",
      expect.objectContaining({ name: "Welcome", title: "Hello", color: 0xff8800, header_text: "Me", fields: [] })
    )
  })

  it("rejects a body that breaks a limit", async () => {
    for (const body of [
      { ...valid, name: "" },
      { ...valid, title: "x".repeat(257) },
      { ...valid, imageUrl: "javascript:alert(1)" },
      { ...valid, color: -1 },
      { ...valid, timestamp: "yesterday" },
      { name: "Only a name" },
    ]) {
      expect((await post(body)).status).toBe(400)
    }
    expect(m.create).not.toHaveBeenCalled()
  })

  it("refuses a venue the caller is not in without calling xvm-api", async () => {
    m.lookup.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Venue not found" }, { status: 404 }) })
    expect((await post(valid)).status).toBe(404)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await post(valid)).status).toBe(401)
  })
})
