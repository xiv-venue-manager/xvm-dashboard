import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("XVM_API_BASE_URL", "http://xvm.test")
  vi.stubGlobal("fetch", vi.fn())
})

const ok = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status })

describe("createPairingCode", () => {
  it("asks for an account-wide plugin code with the person's token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      ok({ code: "ABCD1234", client: "plugin", venue_id: null, expires_at: "2026-10-10T00:00:00Z" })
    )
    const { createPairingCode } = await import("./xvm-api")
    const issued = await createPairingCode("tok")
    expect(issued.code).toBe("ABCD1234")
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("http://xvm.test/pairing/codes")
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" })
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ client: "plugin", venue_id: null })
  })
})
