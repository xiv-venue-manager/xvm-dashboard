import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => {
  const data = new Map<string, string>()
  return {
    data,
    ready: vi.fn(() => true),
    redis: {
      get: vi.fn(async (k: string) => data.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => void data.set(k, v)),
      del: vi.fn(async (k: string) => void data.delete(k)),
    },
    getMe: vi.fn(),
  }
})

vi.mock("@/lib/redis", () => ({ redis: m.redis, ready: m.ready }))
vi.mock("@/lib/api/xvm-api", async (orig) => ({ ...(await orig<typeof import("@/lib/api/xvm-api")>()), getMe: m.getMe }))

import {
  getValidXvmApiPersonId,
  getValidXvmApiToken,
  invalidateXvmApiCredential,
  upsertXvmApiCredential,
} from "./xvm-api-store"
import type { CredentialIssued } from "@/lib/api/xvm-api"

const DAY = 24 * 60 * 60 * 1000
const issued = (secret: string, expiresInMs: number) =>
  ({ secret, credential: { id: 1, expires_at: new Date(Date.now() + expiresInMs).toISOString() } }) as CredentialIssued

beforeEach(async () => {
  m.data.clear()
  m.ready.mockReturnValue(true)
  await invalidateXvmApiCredential("u1")
  await invalidateXvmApiCredential("u2")
  vi.clearAllMocks()
})

describe("the xvm-api credential store", () => {
  it("serves every caller for a person the one credential that was stored last", async () => {
    await upsertXvmApiCredential("u1", issued("laptop", 10 * DAY))
    await upsertXvmApiCredential("u1", issued("phone", 10 * DAY))
    expect(await getValidXvmApiToken("u1")).toBe("phone")
    expect(await getValidXvmApiToken("u2")).toBeNull()
  })

  it("expires the Redis key with the credential", async () => {
    await upsertXvmApiCredential("u1", issued("tok", 10 * DAY))
    const [k, , unit, ttl] = m.redis.set.mock.calls[0] as unknown as [string, string, string, number]
    expect(k).toBe("xvm:credential:u1")
    expect(unit).toBe("PX")
    expect(ttl).toBeGreaterThan(9 * DAY)
    expect(ttl).toBeLessThanOrEqual(10 * DAY)
  })

  it("treats a credential inside the refresh margin as missing", async () => {
    await upsertXvmApiCredential("u1", issued("tok", DAY / 2))
    expect(await getValidXvmApiToken("u1")).toBeNull()
  })

  it("forgets a credential once it is invalidated", async () => {
    await upsertXvmApiCredential("u1", issued("tok", 10 * DAY))
    await invalidateXvmApiCredential("u1")
    expect(await getValidXvmApiToken("u1")).toBeNull()
  })

  it("rejects a credential that has no expiry", async () => {
    await expect(
      upsertXvmApiCredential("u1", { secret: "tok", credential: { id: 1 } } as unknown as CredentialIssued)
    ).rejects.toThrow("missing expires_at")
  })

  it("is empty after a Redis flush, so the next request re-mints", async () => {
    await upsertXvmApiCredential("u1", issued("tok", 10 * DAY))
    m.data.clear()
    expect(await getValidXvmApiToken("u1")).toBeNull()
  })

  it("keeps working from this process while Redis is down", async () => {
    m.ready.mockReturnValue(false)
    await upsertXvmApiCredential("u1", issued("tok", 10 * DAY))
    expect(await getValidXvmApiToken("u1")).toBe("tok")
    expect(m.redis.set).not.toHaveBeenCalled()
  })

  it("falls back to this process when a Redis read throws", async () => {
    await upsertXvmApiCredential("u1", issued("tok", 10 * DAY))
    vi.spyOn(console, "error").mockImplementation(() => {})
    m.redis.get.mockRejectedValueOnce(new Error("boom"))
    expect(await getValidXvmApiToken("u1")).toBe("tok")
  })
})

describe("getValidXvmApiPersonId", () => {
  it("asks /me once and keeps the answer with the credential", async () => {
    await upsertXvmApiCredential("u1", issued("tok", 10 * DAY))
    m.getMe.mockResolvedValue({ person: { id: 77 } })
    expect(await getValidXvmApiPersonId("u1")).toBe(77)
    expect(await getValidXvmApiPersonId("u1")).toBe(77)
    expect(m.getMe).toHaveBeenCalledTimes(1)
    expect(m.getMe).toHaveBeenCalledWith("tok")
  })

  it("is null with no credential and does not call /me", async () => {
    expect(await getValidXvmApiPersonId("u1")).toBeNull()
    expect(m.getMe).not.toHaveBeenCalled()
  })
})
