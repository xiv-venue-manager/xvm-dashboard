import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE_NAME, SESSION_COOKIE_SECURE } from "@/lib/session-cookie"

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

export interface DiscordGrant {
  accessToken: string
  expiresAt: number | null
  scope: string | null
}

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

// cookieName and secureCookie are explicit: getToken guesses "secure" from NEXTAUTH_URL, and a wrong
// guess reads the wrong cookie name and silently returns null for every owner.
export async function discordGrantFrom(request: NextRequest): Promise<DiscordGrant | null> {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: SESSION_COOKIE_NAME,
    secureCookie: SESSION_COOKIE_SECURE,
  })
  return token?.discord ?? null
}

// Deliberately the caller's own Discord token, not the bot's. A guild may only be linked by
// someone who administers it, and only their token proves that — the bot's token would let
// anyone claim any guild the bot happens to be in, and with it that guild's channel, role and
// member names.
export async function listManageableGuilds(grant: DiscordGrant | null): Promise<ManageableGuilds> {
  // A token issued before the guilds scope existed cannot be refreshed into one that has it, so
  // the scope half of this gate genuinely needs re-consent. The expiry half needs a new sign-in
  // too: the grant lives only in the session token, where a refresh could not be persisted.
  const hasScope = grant?.scope?.split(" ").includes("guilds") ?? false
  const live = grant?.expiresAt != null && grant.expiresAt * 1000 > Date.now()
  if (!grant?.accessToken || !hasScope || !live) return { ok: false, failure: "reauth_required" }

  const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${grant.accessToken}` },
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
export async function administersGuild(grant: DiscordGrant | null, guildId: string): Promise<GuildAuthority> {
  const result = await listManageableGuilds(grant)
  if (!result.ok) return result
  return { ok: true, administers: result.guilds.some((guild) => guild.id === guildId) }
}
