import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  set: vi.fn(),
  clear: vi.fn(),
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
  setStickyImage: m.set,
  clearStickyImage: m.clear,
}))

import { PUT, DELETE } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.set.mockResolvedValue({ id: 4, thumbnail_url: "https://cdn/t.png" })
  m.clear.mockResolvedValue(undefined)
})

const context = (stickyId: string, image: string) => ({ params: Promise.resolve({ venueId: "vn_1", stickyId, image }) })
const put = (form: FormData, stickyId = "4", image = "thumbnail") =>
  PUT(new Request("http://localhost/api", { method: "PUT", body: form }) as never, context(stickyId, image) as never)
const del = (stickyId = "4", image = "thumbnail") =>
  DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context(stickyId, image) as never)

const withFile = () => {
  const form = new FormData()
  form.append("file", new File(["x"], "t.png", { type: "image/png" }))
  return form
}

describe("PUT /api/venues/[venueId]/sticky-messages/[stickyId]/images/[image]", () => {
  it("uploads the file to the slot and returns the row", async () => {
    const res = await put(withFile())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 4, thumbnail_url: "https://cdn/t.png" })
    expect(m.set).toHaveBeenCalledWith("tok", "xv-1", 4, "thumbnail", expect.any(File))
  })

  it("requires a file", async () => {
    const res = await put(new FormData())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "file required" })
    expect(m.set).not.toHaveBeenCalled()
  })

  it("rejects an unknown slot or a bad id", async () => {
    expect((await put(withFile(), "4", "banner")).status).toBe(400)
    expect((await put(withFile(), "abc")).status).toBe(400)
    expect(m.set).not.toHaveBeenCalled()
  })

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await put(withFile())).status).toBe(401)
  })
})

describe("DELETE /api/venues/[venueId]/sticky-messages/[stickyId]/images/[image]", () => {
  it("clears the slot", async () => {
    const res = await del("4", "header_icon")
    expect(res.status).toBe(204)
    expect(m.clear).toHaveBeenCalledWith("tok", "xv-1", 4, "header_icon")
  })

  it("rejects an unknown slot", async () => {
    expect((await del("4", "banner")).status).toBe(400)
    expect(m.clear).not.toHaveBeenCalled()
  })
})
