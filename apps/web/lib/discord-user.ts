import { prisma } from "@/lib/prisma"

const DISCORD_API = "https://discord.com/api/v10"
const MANAGE_GUILD = BigInt(32) // 1 << 5

export interface ManageableGuild {
  id: string
  name: string
  iconUrl: string | null
}

export type ManageableGuilds =
  | { ok: true; guilds: ManageableGuild[] }
  | { ok: false; failure: "reauth_required" | "discord_unavailable" }

interface RawUserGuild {
  id: string
  name: string
  icon: string | null
  owner: boolean
  permissions: string
}

function iconUrl(guildId: string, hash: string | null): string | null {
  if (!hash) return null
  const ext = hash.startsWith("a_") ? "gif" : "png"
  return `https://cdn.discordapp.com/icons/${guildId}/${hash}.${ext}?size=64`
}

// Deliberately the caller's own Discord token, not the bot's. A guild may only be linked by
// someone who administers it, and only their token proves that — the bot's token would let
// anyone claim any guild the bot happens to be in, and with it that guild's channel, role and
// member names.
export async function listManageableGuilds(userId: string): Promise<ManageableGuilds> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "discord" },
    select: { access_token: true, expires_at: true, scope: true },
  })

  // No refresh path, on purpose: a token issued before the guilds scope existed cannot be
  // refreshed into one that has it, so re-consent is the only fix for the case that will
  // actually happen, and the only one worth building.
  const hasScope = account?.scope?.split(" ").includes("guilds") ?? false
  const live = account?.expires_at != null && account.expires_at * 1000 > Date.now()
  if (!account?.access_token || !hasScope || !live) return { ok: false, failure: "reauth_required" }

  const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  }).catch(() => null)

  if (response?.status === 401) return { ok: false, failure: "reauth_required" }
  if (!response?.ok) {
    console.warn(`[discord-user] GET /users/@me/guilds -> ${response?.status ?? "threw"}`)
    return { ok: false, failure: "discord_unavailable" }
  }

  const raw = (await response.json()) as RawUserGuild[]
  return {
    ok: true,
    guilds: raw
      .filter((guild) => guild.owner || (BigInt(guild.permissions) & MANAGE_GUILD) === MANAGE_GUILD)
      .map((guild) => ({ id: guild.id, name: guild.name, iconUrl: iconUrl(guild.id, guild.icon) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export type GuildAuthority =
  | { ok: true; administers: boolean }
  | { ok: false; failure: "reauth_required" | "discord_unavailable" }

// Re-checked server-side on save rather than trusting a posted guild id: the list above is
// advisory, and the endpoint is reachable by direct POST whatever the UI rendered.
export async function administersGuild(userId: string, guildId: string): Promise<GuildAuthority> {
  const result = await listManageableGuilds(userId)
  if (!result.ok) return result
  return { ok: true, administers: result.guilds.some((guild) => guild.id === guildId) }
}
