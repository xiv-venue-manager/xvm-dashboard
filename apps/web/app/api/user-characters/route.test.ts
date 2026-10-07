import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), list: vi.fn(), link: vi.fn() }))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listMyCharacters: m.list,
  linkMyCharacter: m.link,
}))

import { GET, POST } from "./route"
import { XvmApiError, type MyCharacterRow } from "@/lib/api/xvm-api"

const row = (over: Partial<MyCharacterRow> = {}): MyCharacterRow => ({
  id: 4,
  character_name: "Test Char",
  world: "Lich",
  is_primary: true,
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

describe("GET /api/user-characters", () => {
  it("is 401 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
    expect(m.list).not.toHaveBeenCalled()
  })

  it("is 503 when there is no xvm-api link", async () => {
    m.token.mockResolvedValue(null)
    expect((await GET()).status).toBe(503)
  })

  it("returns the characters in the shape the characters page reads", async () => {
    m.list.mockResolvedValue([row(), row({ id: 5, character_name: "Alt", is_primary: false })])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(m.list).toHaveBeenCalledWith("tok")
    expect(await res.json()).toEqual({
      characters: [
        { id: "4", characterName: "Test Char", world: "Lich", isPrimary: true },
        { id: "5", characterName: "Alt", world: "Lich", isPrimary: false },
      ],
    })
  })

  it("forwards an upstream failure", async () => {
    m.list.mockRejectedValue(new XvmApiError(500, "boom"))
    expect((await GET()).status).toBe(500)
  })
})

describe("POST /api/user-characters", () => {
  const valid = { characterName: "Test Char", world: "Lich" }

  it("rejects a missing body, name or world with 400 and no API call", async () => {
    for (const body of [null, { ...valid, characterName: "" }, { ...valid, world: "" }, { world: "Lich" }]) {
      expect((await post(body)).status).toBe(400)
    }
    expect(m.link).not.toHaveBeenCalled()
  })

  it("links the character and returns it in the page's shape", async () => {
    m.link.mockResolvedValue(row())
    const res = await post(valid)
    expect(res.status).toBe(200)
    expect(m.link).toHaveBeenCalledWith("tok", { character_name: "Test Char", world: "Lich" })
    expect(await res.json()).toEqual({ character: { id: "4", characterName: "Test Char", world: "Lich", isPrimary: true } })
  })

  it("forwards xvm-api's already-linked-elsewhere conflict", async () => {
    m.link.mockRejectedValue(new XvmApiError(409, JSON.stringify({ detail: "That character is linked to another account." })))
    const res = await post(valid)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("another account")
  })
})
