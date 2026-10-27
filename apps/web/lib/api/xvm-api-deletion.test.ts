import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("XVM_API_BASE_URL", "http://xvm.test")
  vi.stubGlobal("fetch", vi.fn())
})

const reply = (body: unknown, status: number) => new Response(JSON.stringify(body), { status })

describe("requestAccountDeletion", () => {
  it("deletes /me with the person's token and returns the grace period", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      reply({ requested_at: "2026-10-27T09:00:00Z", anonymises_at: "2026-11-26T09:00:00Z" }, 202)
    )
    const { requestAccountDeletion } = await import("./xvm-api")
    const deletion = await requestAccountDeletion("tok")
    expect(deletion.anonymises_at).toBe("2026-11-26T09:00:00Z")
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("http://xvm.test/me")
    expect((init as RequestInit).method).toBe("DELETE")
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" })
  })

  it("throws an XvmApiError carrying the refusal text on a 409", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply({ detail: "Unpaid payroll at Velvet Rift." }, 409))
    const { requestAccountDeletion, XvmApiError, xvmErrorMessage } = await import("./xvm-api")
    const err = await requestAccountDeletion("tok").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(XvmApiError)
    expect((err as InstanceType<typeof XvmApiError>).status).toBe(409)
    expect(xvmErrorMessage(err as InstanceType<typeof XvmApiError>)).toContain("Unpaid payroll at Velvet Rift.")
  })
})
