import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
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

describe("Discord provider", () => {
  it("sets the issuer, without which a callback carrying iss is rejected", () => {
    expect(discord.id).toBe("discord")
    expect(discord.options?.issuer).toBe("https://discord.com")
  })
})
