import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  userUpdate: vi.fn(),
  accountFindFirst: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: m.userUpdate }, account: { findFirst: m.accountFindFirst } },
}))
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }))
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
  xvmCredentialFrom: vi.fn(() => ({ token: "xvm-secret", expiresAt: 123 })),
  isXvmCredentialFresh: vi.fn(),
}))

import { authOptions, refreshXvmCredential } from "./auth"
import { exchangeToken, XvmApiError } from "@/lib/api/xvm-api"
import { isXvmCredentialFresh } from "@/lib/api/xvm-api-store"
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
  m.userUpdate.mockResolvedValue({})
  vi.mocked(isXvmCredentialFresh).mockReturnValue(true)
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

describe("signIn", () => {
  it("lets a Discord sign-in through without writing the grant anywhere", async () => {
    await expect(signIn({ user: { id: "user-1", image: "https://cdn/a.png" }, account })).resolves.toBe(true)
    expect(m.userUpdate).toHaveBeenCalledTimes(1)
  })

  it("writes the avatar Discord holds now, not the stored one the row already has", async () => {
    await signIn({
      user: { id: "user-1", image: "https://cdn/old.png" },
      account,
      profile: { image_url: "https://cdn/new.png" },
    })
    expect(m.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { image: "https://cdn/new.png", discordId: "4242" },
    })
  })

  it("leaves the stored avatar alone when the profile carries none", async () => {
    await signIn({ user: { id: "user-1", image: "https://cdn/old.png" }, account, profile: {} })
    expect(m.userUpdate).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { discordId: "4242" } })
  })

  it("refuses a sign-in carrying neither an email nor a provider account id", async () => {
    await expect(signIn({ user: {}, account: null })).resolves.toBe(false)
  })
})

describe("jwt", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jwt = (args: any) => (authOptions.callbacks!.jwt as any)(args)

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

  it("keeps the xvm-api token on the JWT after a sign-in", async () => {
    const token = await jwt({ token: { id: "u1" }, user: { id: "u1", name: "A" }, account })
    expect(token.xvm).toEqual({ token: "xvm-secret", expiresAt: 123 })
  })

  it("leaves a fresh xvm-api token alone on later calls", async () => {
    const xvm = { token: "kept", expiresAt: 999 }
    const token = await refreshXvmCredential({ id: "u1", name: "A", xvm })
    expect(token.xvm).toEqual(xvm)
    expect(exchangeToken).not.toHaveBeenCalled()
  })

  it("re-mints a missing xvm-api token without marking it fresh, so a pending deletion stays pending", async () => {
    vi.mocked(isXvmCredentialFresh).mockReturnValue(false)
    m.accountFindFirst.mockResolvedValue({ providerAccountId: "4242" })
    const token = await refreshXvmCredential({ id: "u1", name: "A" })
    expect(exchangeToken).toHaveBeenCalledWith("4242", "A")
    expect(token.xvm).toEqual({ token: "xvm-secret", expiresAt: 123 })
  })

  it("never exchanges outside a sign-in, since only the route handler can persist the cookie", async () => {
    vi.mocked(isXvmCredentialFresh).mockReturnValue(false)
    m.accountFindFirst.mockResolvedValue({ providerAccountId: "4242" })
    const token = await jwt({ token: { id: "u1", name: "A" } })
    expect(exchangeToken).not.toHaveBeenCalled()
    expect(token.xvm).toBeUndefined()
  })

  it("shares one exchange between concurrent refreshes of the same user, since a second would revoke the first", async () => {
    vi.mocked(isXvmCredentialFresh).mockReturnValue(false)
    m.accountFindFirst.mockResolvedValue({ providerAccountId: "4242" })
    const [a, b, c] = await Promise.all([
      refreshXvmCredential({ id: "shared-1", name: "A" }),
      refreshXvmCredential({ id: "shared-1", name: "A" }),
      refreshXvmCredential({ id: "shared-1", name: "A" }),
    ])
    expect(exchangeToken).toHaveBeenCalledTimes(1)
    expect(b.xvm).toEqual(a.xvm)
    expect(c.xvm).toEqual(a.xvm)
  })

  it("does not share an exchange between different users", async () => {
    vi.mocked(isXvmCredentialFresh).mockReturnValue(false)
    m.accountFindFirst.mockResolvedValue({ providerAccountId: "4242" })
    await Promise.all([refreshXvmCredential({ id: "other-1", name: "A" }), refreshXvmCredential({ id: "other-2", name: "B" })])
    expect(exchangeToken).toHaveBeenCalledTimes(2)
  })

  it("lets a failed exchange be retried straight away", async () => {
    vi.mocked(isXvmCredentialFresh).mockReturnValue(false)
    m.accountFindFirst.mockResolvedValue({ providerAccountId: "4242" })
    vi.mocked(exchangeToken).mockRejectedValueOnce(new XvmApiError(503, "down"))
    await refreshXvmCredential({ id: "retry-1", name: "A" })
    await refreshXvmCredential({ id: "retry-1", name: "A" })
    expect(exchangeToken).toHaveBeenCalledTimes(2)
  })

  it("stores no grant for another provider", async () => {
    const token = await jwt({ token: { id: "u1" }, user: { id: "u1" }, account: { ...account, provider: "github" } })
    expect(token.discord).toBeUndefined()
  })

  describe("a pending deletion", () => {
    const refreshing = () => {
      vi.mocked(isXvmCredentialFresh).mockReturnValue(false)
      m.accountFindFirst.mockResolvedValue({ providerAccountId: "4242" })
    }

    it("marks the token when the refresh exchange is refused with a 409", async () => {
      refreshing()
      vi.mocked(exchangeToken).mockRejectedValueOnce(
        new XvmApiError(409, '{"detail":"This account is scheduled for deletion. Sign in again to cancel it."}')
      )
      const token = await refreshXvmCredential({ id: "del-409", name: "A" })
      expect(token.deletionPending).toBe(true)
      expect(console.error).not.toHaveBeenCalled()
    })

    it("does not mark the token for any other failure, which stays logged and non-fatal", async () => {
      refreshing()
      vi.mocked(exchangeToken)
        .mockRejectedValueOnce(new XvmApiError(503, "down"))
        .mockRejectedValueOnce(new Error("network"))
      expect((await refreshXvmCredential({ id: "del-503", name: "A" })).deletionPending).toBeUndefined()
      expect((await refreshXvmCredential({ id: "del-net", name: "A" })).deletionPending).toBeUndefined()
      expect(console.error).toHaveBeenCalledTimes(2)
    })

    it("does not try to mint a token again while the marker is set", async () => {
      refreshing()
      const token = await refreshXvmCredential({ id: "u1", name: "A", deletionPending: true })
      expect(token.deletionPending).toBe(true)
      expect(isXvmCredentialFresh).not.toHaveBeenCalled()
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
    expect(SESSION_COOKIE_NAME).toMatch(/next-auth\.session-token$/)
  })
})

describe("linkAccount event", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkAccount = (args: any) => (authOptions.events!.linkAccount as any)(args)

  it("stores the Discord id on the user row, which exists by now even for a first sign-in", async () => {
    await linkAccount({ user: { id: "user-1" }, account })
    expect(m.userUpdate).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { discordId: "4242" } })
  })

  it("leaves the user row alone for another provider", async () => {
    await linkAccount({ user: { id: "user-1" }, account: { ...account, provider: "github" } })
    expect(m.userUpdate).not.toHaveBeenCalled()
  })
})
