import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  userUpdate: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: m.userUpdate } },
}))
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }))
vi.mock("@/lib/api/xvm-api", () => ({ exchangeToken: vi.fn() }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  upsertXvmApiCredential: vi.fn(),
  getValidXvmApiToken: vi.fn(),
}))

import { authOptions } from "./auth"
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

  it("leaves the stored grant alone on later calls that carry no account", async () => {
    const stored = { accessToken: "t", expiresAt: 1, scope: "guilds" }
    const token = await jwt({ token: { id: "u1", discord: stored } })
    expect(token.discord).toEqual(stored)
  })

  it("stores no grant for another provider", async () => {
    const token = await jwt({ token: { id: "u1" }, user: { id: "u1" }, account: { ...account, provider: "github" } })
    expect(token.discord).toBeUndefined()
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
