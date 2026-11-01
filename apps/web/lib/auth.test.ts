import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api/xvm-api", () => ({
  exchangeToken: vi.fn(),
  XvmApiError: class XvmApiError extends Error {
    constructor(
      public status: number,
      public body: string
    ) {
      super(`xvm-api ${status}: ${body}`)
    }
  },
}))
vi.mock("@/lib/api/xvm-api-store", () => ({
  upsertXvmApiCredential: vi.fn(),
  getValidXvmApiToken: vi.fn(),
}))

import { authOptions } from "./auth"
import { exchangeToken, XvmApiError } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, upsertXvmApiCredential } from "@/lib/api/xvm-api-store"
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie"

// next-auth v4 keeps the values passed to a provider factory under `options`, not on the
// provider itself, so that is what has to be asserted.
const discord = authOptions.providers[0] as unknown as { id: string; options?: Record<string, unknown> }

const account = {
  provider: "discord",
  providerAccountId: "4242",
  access_token: "fresh-token",
  refresh_token: "fresh-refresh",
  expires_at: 1800000000,
  scope: "identify email guilds",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const signIn = (args: any) => (authOptions.callbacks!.signIn as any)(args)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("Discord provider", () => {
  it("sets the issuer, without which a callback carrying iss is rejected", () => {
    expect(discord.id).toBe("discord")
    expect(discord.options?.issuer).toBe("https://discord.com")
  })

  it("asks for the guilds scope, which is what proves an owner administers a server", () => {
    const authorization = discord.options?.authorization as { params?: { scope?: string } }
    expect(authorization.params?.scope?.split(" ")).toContain("guilds")
  })
})

describe("adapter", () => {
  it("is not set, so signing in creates no Prisma row", () => {
    expect(authOptions.adapter).toBeUndefined()
  })
})

describe("signIn", () => {
  it("lets a Discord sign-in through", async () => {
    await expect(signIn({ user: { id: "4242" }, account })).resolves.toBe(true)
  })

  it("refuses a sign-in with no provider account id, even if it carries an email", async () => {
    await expect(signIn({ user: { email: "a@example.test" }, account: null })).resolves.toBe(false)
    await expect(signIn({ user: {}, account: { ...account, providerAccountId: "" } })).resolves.toBe(false)
  })
})

describe("jwt", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jwt = (args: any) => (authOptions.callbacks!.jwt as any)(args)

  it("keys the token on the Discord id, not on anything the provider calls the user", async () => {
    const token = await jwt({ token: {}, user: { id: "something-else", name: "A" }, account })
    expect(token.id).toBe("4242")
  })

  it("puts the renewed Discord grant on the token at every sign-in", async () => {
    const token = await jwt({ token: { id: "u1" }, user: { id: "u1", name: "A" }, account })
    expect(token.discord).toEqual({
      accessToken: "fresh-token",
      expiresAt: 1800000000,
      scope: "identify email guilds",
    })
  })

  it("puts the current Discord avatar on the token, not the stored row's", async () => {
    const token = await jwt({
      token: { id: "u1" },
      user: { id: "u1", name: "A", image: "https://cdn/old.png" },
      account,
      profile: { image_url: "https://cdn/new.png" },
    })
    expect(token.picture).toBe("https://cdn/new.png")
  })

  it("keeps the stored row's avatar on the token when the profile carries none", async () => {
    const token = await jwt({ token: { id: "u1" }, user: { id: "u1", name: "A", image: "https://cdn/old.png" }, account })
    expect(token.picture).toBe("https://cdn/old.png")
  })

  it("leaves the stored grant alone on later calls that carry no account", async () => {
    const stored = { accessToken: "t", expiresAt: 1, scope: "guilds" }
    const token = await jwt({ token: { id: "u1", discord: stored } })
    expect(token.discord).toEqual(stored)
  })

  it("marks the exchange fresh when the person has just signed in with Discord", async () => {
    await jwt({ token: { id: "u1" }, user: { id: "u1", name: "A" }, account })
    expect(exchangeToken).toHaveBeenCalledWith("4242", "A", true)
  })

  it("stores the credential under the Discord id, the key every later request reads it by", async () => {
    await jwt({ token: {}, user: { id: "4242", name: "A" }, account })
    expect(upsertXvmApiCredential).toHaveBeenCalledWith("4242", undefined)
  })

  it("re-mints a missing xvm-api token without marking it fresh, so a pending deletion stays pending", async () => {
    vi.mocked(getValidXvmApiToken).mockResolvedValue(null)
    await jwt({ token: { id: "4242", name: "A" } })
    expect(exchangeToken).toHaveBeenCalledWith("4242", "A")
  })

  it("shares one exchange between callbacks that find the credential missing at the same time", async () => {
    vi.mocked(getValidXvmApiToken).mockResolvedValue(null)
    vi.mocked(exchangeToken).mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({} as never), 10)))
    await Promise.all([1, 2, 3].map(() => jwt({ token: { id: "4242", name: "A" } })))
    expect(exchangeToken).toHaveBeenCalledTimes(1)
  })

  it("mints again on the next callback once the exchange has finished and the credential is gone", async () => {
    vi.mocked(getValidXvmApiToken).mockResolvedValue(null)
    await jwt({ token: { id: "4242", name: "A" } })
    await jwt({ token: { id: "4242", name: "A" } })
    expect(exchangeToken).toHaveBeenCalledTimes(2)
  })

  it("does not mint for a session whose id is not a Discord id, such as one issued before the adapter went", async () => {
    vi.mocked(getValidXvmApiToken).mockResolvedValue(null)
    await jwt({ token: { id: "clx0old0cuid0000", name: "A" } })
    expect(exchangeToken).not.toHaveBeenCalled()
  })

  it("stores no grant for another provider", async () => {
    const token = await jwt({ token: { id: "u1" }, user: { id: "u1" }, account: { ...account, provider: "github" } })
    expect(token.discord).toBeUndefined()
  })

  describe("a pending deletion", () => {
    const refreshing = () => {
      vi.mocked(getValidXvmApiToken).mockResolvedValue(null)
      }

    it("marks the token when the refresh exchange is refused with a 409", async () => {
      refreshing()
      vi.mocked(exchangeToken).mockRejectedValueOnce(
        new XvmApiError(409, '{"detail":"This account is scheduled for deletion. Sign in again to cancel it."}')
      )
      const token = await jwt({ token: { id: "4242", name: "A" } })
      expect(token.deletionPending).toBe(true)
      expect(console.error).not.toHaveBeenCalled()
    })

    it("does not mark the token for any other failure, which stays logged and non-fatal", async () => {
      refreshing()
      vi.mocked(exchangeToken)
        .mockRejectedValueOnce(new XvmApiError(503, "down"))
        .mockRejectedValueOnce(new Error("network"))
      expect((await jwt({ token: { id: "4242", name: "A" } })).deletionPending).toBeUndefined()
      expect((await jwt({ token: { id: "4242", name: "A" } })).deletionPending).toBeUndefined()
      expect(console.error).toHaveBeenCalledTimes(2)
    })

    it("does not try to mint a token again while the marker is set", async () => {
      refreshing()
      const token = await jwt({ token: { id: "4242", name: "A", deletionPending: true } })
      expect(token.deletionPending).toBe(true)
      expect(getValidXvmApiToken).not.toHaveBeenCalled()
      expect(exchangeToken).not.toHaveBeenCalled()
    })
  })
})

describe("session", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (args: any) => (authOptions.callbacks!.session as any)(args)

  it("exposes the pending deletion marker", async () => {
    const out = await session({ session: { user: {} }, token: { id: "u1", deletionPending: true } })
    expect(out.deletionPending).toBe(true)
    expect(out.user.id).toBe("u1")
  })

  it("leaves the flag off a normal session", async () => {
    const out = await session({ session: { user: {} }, token: { id: "u1" } })
    expect(out.deletionPending).toBeUndefined()
  })
})

describe("redirect", () => {
  const redirect = (url: string) => authOptions.callbacks!.redirect!({ url, baseUrl: "http://localhost:3000" })

  it("keeps the path and query of a relative callbackUrl", async () => {
    expect(await redirect("/admin/feedback?report=7")).toBe("http://localhost:3000/admin/feedback?report=7")
  })

  it("sends an off-site callbackUrl back to the base URL", async () => {
    expect(await redirect("https://evil.example/admin/feedback")).toBe("http://localhost:3000")
  })

  it("keeps a protocol-relative callbackUrl on our origin", async () => {
    expect(new URL(await redirect("//evil.example/admin/feedback")).origin).toBe("http://localhost:3000")
  })
})

describe("session cookie", () => {
  it("uses the shared cookie name that the readers pass to getToken", () => {
    expect(authOptions.cookies?.sessionToken?.name).toBe(SESSION_COOKIE_NAME)
  })

  it("is not an extension of the old name, which next-auth would match by prefix and merge with", () => {
    expect(SESSION_COOKIE_NAME.startsWith("next-auth.session-token")).toBe(false)
    expect(SESSION_COOKIE_NAME.startsWith("__Secure-next-auth.session-token")).toBe(false)
    expect("next-auth.session-token".startsWith(SESSION_COOKIE_NAME)).toBe(false)
  })
})
