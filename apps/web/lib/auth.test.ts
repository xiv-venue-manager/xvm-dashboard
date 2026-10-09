import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  userUpdate: vi.fn(),
  accountUpdate: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: m.userUpdate }, account: { updateMany: m.accountUpdate } },
}))
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }))
vi.mock("@/lib/api/xvm-api", () => ({ exchangeToken: vi.fn() }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  upsertXvmApiCredential: vi.fn(),
  getValidXvmApiToken: vi.fn(),
}))

import { authOptions } from "./auth"

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
  m.accountUpdate.mockResolvedValue({})
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
  it("writes the renewed token, scope and expiry onto the account row", async () => {
    // next-auth only writes these at linkAccount, so re-signing in would otherwise leave a
    // grant that predates the guilds scope in place and the reauth prompt would do nothing.
    await signIn({ user: { id: "user-1", image: "https://cdn/a.png" }, account })
    expect(m.accountUpdate).toHaveBeenCalledWith({
      where: { provider: "discord", providerAccountId: "4242" },
      data: {
        access_token: "fresh-token",
        expires_at: 1800000000,
        scope: "identify email guilds",
        refresh_token: "fresh-refresh",
      },
    })
  })

  it("still lets a person in when the account row cannot be written", async () => {
    m.accountUpdate.mockRejectedValue(new Error("gone"))
    await expect(signIn({ user: { id: "user-1" }, account })).resolves.toBe(true)
  })

  it("leaves the account row alone for a first sign-in, which linkAccount writes", async () => {
    // A new user's id here is the provider profile id, and no row exists yet, so the update
    // matches nothing and must neither throw nor log.
    m.accountUpdate.mockResolvedValue({ count: 0 })
    await expect(signIn({ user: { id: "4242", email: "a@b.c" }, account })).resolves.toBe(true)
    expect(console.error).not.toHaveBeenCalled()
  })

  it("does not touch the account row when the user has no id at all", async () => {
    await expect(signIn({ user: { email: "a@b.c" }, account })).resolves.toBe(true)
    expect(m.accountUpdate).not.toHaveBeenCalled()
  })

  it("refuses a sign-in carrying neither an email nor a provider account id", async () => {
    await expect(signIn({ user: {}, account: null })).resolves.toBe(false)
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
