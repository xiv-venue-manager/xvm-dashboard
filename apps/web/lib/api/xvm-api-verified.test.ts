import { describe, it, expect, vi, afterEach } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("recordVerifiedCharacters", () => {
  it("posts the person and characters with the dashboard service credential", async () => {
    vi.stubEnv("XVM_API_DASHBOARD_SERVICE_TOKEN", "service-token")
    vi.resetModules()
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([{ outcome: "created" }]), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const { recordVerifiedCharacters } = await import("./xvm-api")
    const characters = [{ lodestone_id: 1, xivauth_key: "k", character_name: "Aa Bb", world: "Lich" }]
    expect(await recordVerifiedCharacters(42, characters)).toEqual([{ outcome: "created" }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("http://xvm-api.test/internal/characters/verified")
    expect(init.method).toBe("POST")
    expect(init.headers.Authorization).toBe("Bearer service-token")
    expect(JSON.parse(init.body)).toEqual({ person_id: 42, characters })
  })

  it("refuses to run without the service credential", async () => {
    vi.stubEnv("XVM_API_DASHBOARD_SERVICE_TOKEN", "")
    vi.resetModules()
    const { recordVerifiedCharacters } = await import("./xvm-api")
    await expect(recordVerifiedCharacters(1, [])).rejects.toThrow("XVM_API_DASHBOARD_SERVICE_TOKEN is not set")
  })
})
