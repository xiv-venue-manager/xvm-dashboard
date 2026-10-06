import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), list: vi.fn(), create: vi.fn() }))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listShouts: m.list,
  createShout: m.create,
}))

import { GET, POST } from "./route"
import { XvmApiError, type ShoutRow } from "@/lib/api/xvm-api"

const ORIGIN = "https://shout.xivvenuemanager.com"
const row = (over: Partial<ShoutRow> = {}): ShoutRow => ({
  id: 4,
  label: "Open",
  fields: { venue: "Lilypad" },
  template_id: "open-now",
  separator_id: "dot",
  decor_id: "diamond",
  created_at: "2026-10-06T12:00:00Z",
  ...over,
})
const post = (body: unknown) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
})

describe("GET /api/shout-crafter/shouts", () => {
  it("is 401 with CORS headers when signed out", async () => {
    m.session.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
    expect(m.list).not.toHaveBeenCalled()
  })

  it("is 503 when there is no xvm-api link", async () => {
    m.token.mockResolvedValue(null)
    expect((await GET()).status).toBe(503)
  })

  it("returns the shouts in the shape the Shout Crafter app reads", async () => {
    m.list.mockResolvedValue([row()])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
    expect(m.list).toHaveBeenCalledWith("tok")
    expect(await res.json()).toEqual([
      {
        id: "4",
        label: "Open",
        fields: { venue: "Lilypad" },
        templateId: "open-now",
        separatorId: "dot",
        decorId: "diamond",
        createdAt: "2026-10-06T12:00:00Z",
      },
    ])
  })

  it("keeps the CORS headers on an upstream failure", async () => {
    m.list.mockRejectedValue(new XvmApiError(500, "boom"))
    const res = await GET()
    expect(res.status).toBe(500)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
  })
})

describe("POST /api/shout-crafter/shouts", () => {
  const valid = { label: "  Open  ", fields: { venue: "Lilypad" }, templateId: "open-now" }

  it("rejects a missing label, fields or template with 400 and no API call", async () => {
    for (const body of [{ ...valid, label: "   " }, { ...valid, fields: undefined }, { ...valid, templateId: "" }, null]) {
      expect((await post(body)).status).toBe(400)
    }
    expect(m.create).not.toHaveBeenCalled()
  })

  it("creates the shout with a trimmed label and leaves unset ids to the API defaults", async () => {
    m.create.mockResolvedValue(row())
    const res = await post(valid)
    expect(res.status).toBe(201)
    expect(m.create).toHaveBeenCalledWith("tok", {
      label: "Open",
      fields: { venue: "Lilypad" },
      template_id: "open-now",
      separator_id: undefined,
      decor_id: undefined,
    })
    expect((await res.json()).templateId).toBe("open-now")
  })

  it("passes the separator and decor through when given", async () => {
    m.create.mockResolvedValue(row())
    await post({ ...valid, separatorId: "pipe", decorId: "star" })
    expect(m.create.mock.calls[0][1]).toMatchObject({ separator_id: "pipe", decor_id: "star" })
  })

  it("forwards xvm-api's limit and duplicate-label conflicts with CORS headers", async () => {
    m.create.mockRejectedValue(new XvmApiError(409, JSON.stringify({ detail: "You already have 50 saved shouts." })))
    const res = await post(valid)
    expect(res.status).toBe(409)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
    expect((await res.json()).error).toContain("50 saved shouts")
  })
})
