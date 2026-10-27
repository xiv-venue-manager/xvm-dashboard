import { describe, it, expect, vi, afterEach } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("DISCORD_BOT_INVITE_URL", () => {
  it("names only the configured application, leaving scopes and permissions to its install settings", async () => {
    vi.stubEnv("NEXT_PUBLIC_DISCORD_APPLICATION_ID", "1544109870188470334")
    const { DISCORD_BOT_INVITE_URL } = await import("./discord-invite")
    expect(DISCORD_BOT_INVITE_URL).toBe("https://discord.com/oauth2/authorize?client_id=1544109870188470334")
  })
})
