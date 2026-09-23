import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockGetToken, mockInvalidate } = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
  mockInvalidate: vi.fn(),
}))

vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: mockGetToken,
  invalidateXvmApiCredential: mockInvalidate,
  isXvmAuthFailure: (err: unknown) => (err as { status?: number }).status === 401,
}))

import { xvmPageReader } from "./xvm-page-read"

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("xvmPageReader", () => {
  it("returns the fallback without a token lookup when the venue is not connected", async () => {
    const read = await xvmPageReader("user-1", null)
    const call = vi.fn()
    expect(await read("t", 7, call)).toBe(7)
    expect(mockGetToken).not.toHaveBeenCalled()
    expect(call).not.toHaveBeenCalled()
  })

  it("returns the fallback when the user has no xvm-api token", async () => {
    mockGetToken.mockResolvedValue(null)
    const read = await xvmPageReader("user-1", "venue-1")
    const call = vi.fn()
    expect(await read("t", 7, call)).toBe(7)
    expect(call).not.toHaveBeenCalled()
  })

  it("passes token and venue id to the call and returns its result", async () => {
    mockGetToken.mockResolvedValue("tok")
    const read = await xvmPageReader("user-1", "venue-1")
    const call = vi.fn().mockResolvedValue(42)
    expect(await read("t", 7, call)).toBe(42)
    expect(call).toHaveBeenCalledWith("tok", "venue-1")
  })

  it("returns the fallback and invalidates the credential on a 401", async () => {
    mockGetToken.mockResolvedValue("tok")
    const read = await xvmPageReader("user-1", "venue-1")
    expect(await read("t", 7, () => Promise.reject({ status: 401 }))).toBe(7)
    expect(mockInvalidate).toHaveBeenCalledWith("user-1")
  })

  it("returns the fallback without invalidating on a non-auth error", async () => {
    mockGetToken.mockResolvedValue("tok")
    const read = await xvmPageReader("user-1", "venue-1")
    expect(await read("t", 7, () => Promise.reject({ status: 403 }))).toBe(7)
    expect(mockInvalidate).not.toHaveBeenCalled()
  })
})
