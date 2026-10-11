// Ported from FroggeBot Dashboard (src/lib/discord-rest.ts) as a resource drop — NOT wired
// into anything yet. Battle-tested in Frogge production; the comments throughout document
// real incidents and are part of the value. Adaptations from the original, kept minimal:
//   1. `import "server-only"` dropped (package not in this app) — treat this module as
//      server-side only regardless; it holds the bot token.
//   2. Token read from process.env.DISCORD_BOT_TOKEN (same var lib/discord-bot.ts uses).
//      NOTE: every function here only works for guilds THAT BOT IS IN — for venue guilds
//      that means Frogge's token, which is a team decision to settle before wiring.
//   3. DiscordEmojiOption + guildIconUrl inlined (they live in separate Frogge modules).
// Original design notes below are Frogge's, unedited.
//
// Direct calls to Discord's REST API from the Dashboard server itself. No discord.js
// dependency — narrowly-scoped endpoints, not worth a full client library.
//
// Every exported mutation here must NEVER throw — degrade to a soft failure code the
// caller can surface, not blow up the whole request.

const DISCORD_API = "https://discord.com/api/v10"
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!

export type DiscordSyncFailure = "forbidden" | "not_found" | "unknown"

export interface DiscordEmojiOption {
  id: string
  name: string
  animated: boolean
}

function guildIconUrl(guildId: string, iconHash: string | null, size = 256): string | null {
  if (!iconHash) return null
  const ext = iconHash.startsWith("a_") ? "gif" : "png"
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}?size=${size}`
}

// T defaults to unknown for call sites (grantRole/revokeRole) that only care about success/
// failure — Discord's role PUT/DELETE endpoints return 204 No Content, so `data` is undefined
// there. Call sites that need the response body supply T explicitly.
async function discordFetch<T = unknown>(
  path: string,
  init: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; failure: DiscordSyncFailure }> {
  try {
    let response = await fetch(`${DISCORD_API}${path}`, {
      ...init,
      headers: { Authorization: `Bot ${BOT_TOKEN}`, ...init.headers },
    })

    if (response.status === 429) {
      const body = await response.json().catch(() => null)
      const retryAfterMs = typeof body?.retry_after === "number" ? body.retry_after * 1000 : 1000
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
      response = await fetch(`${DISCORD_API}${path}`, {
        ...init,
        headers: { Authorization: `Bot ${BOT_TOKEN}`, ...init.headers },
      })
    }

    if (response.ok) {
      const text = await response.text()
      return { ok: true, data: (text ? JSON.parse(text) : undefined) as T }
    }
    if (response.status === 403) return { ok: false, failure: "forbidden" }
    if (response.status === 404) return { ok: false, failure: "not_found" }
    return { ok: false, failure: "unknown" }
  } catch {
    return { ok: false, failure: "unknown" }
  }
}

export async function grantRole(
  guildId: string,
  userId: string,
  roleId: string,
  reason: string,
): Promise<DiscordSyncFailure | null> {
  const result = await discordFetch(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: "PUT",
    headers: { "X-Audit-Log-Reason": encodeURIComponent(reason) },
  })
  return result.ok ? null : result.failure
}

export async function revokeRole(
  guildId: string,
  userId: string,
  roleId: string,
  reason: string,
): Promise<DiscordSyncFailure | null> {
  const result = await discordFetch(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: "DELETE",
    headers: { "X-Audit-Log-Reason": encodeURIComponent(reason) },
  })
  return result.ok ? null : result.failure
}

// --- Read-only lookups for live pickers (roles/channels/members) ---
//
// Same never-throw invariant as above, but shaped as a discriminated result (not a warning
// code) since there's no prior mutation these need to avoid masking — callers just need to
// know whether the data came back or not. No 429 retry here, deliberately: getGuildRoles/
// getGuildChannels are one-shot page-load reads (retrying delays the whole page), and
// searchGuildMembers is a live per-keystroke path where blocking on Discord's retry_after
// would read as broken — on 429, fail fast and let the next keystroke's debounce retry.

// `status` is carried on failure so callers can tell *why* - specifically so a 404 (the bot can't
// see this guild, i.e. it isn't a member) can be reported as the fact it is, rather than lumped in
// with 401/403/429/network as an anonymous "no data". Optional because a thrown fetch has no status.
export type DiscordFetchResult<T> = { ok: true; data: T } | { ok: false; status?: number }

// Failures are logged, not just swallowed. Returning a bare `{ok:false}` and saying nothing made
// a real production problem invisible: every role/channel picker silently falls back to its
// "type a Discord ID" mode when the option list comes back empty, which looks like a deliberate UI
// choice rather than a broken integration. The function logs showed nothing but 200s while
// every picker on the site was degraded, because this function never wrote a line.
//
// The status code is the whole diagnosis and costs nothing to record: 401 is a bad token, 403 is a
// token whose application lacks access, 404 usually means the bot isn't in that guild at all, 429
// is rate limiting. Never log the token or the response body - the path and status are enough.
async function discordFetchJson<T>(path: string): Promise<DiscordFetchResult<T>> {
  try {
    const response = await fetch(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    })
    if (!response.ok) {
      console.warn(`[discord-rest] GET ${path} -> ${response.status} ${response.statusText}`)
      return { ok: false, status: response.status }
    }
    return { ok: true, data: (await response.json()) as T }
  } catch (error) {
    console.warn(`[discord-rest] GET ${path} threw: ${error instanceof Error ? error.message : String(error)}`)
    return { ok: false }
  }
}

export interface DiscordRoleOption {
  id: string
  name: string
  color: number
  // `permissions` is Discord's decimal-string bitfield (can exceed Number.MAX_SAFE_INTEGER, so
  // callers must parse it via BigInt, never Number()) - both fields exist purely to back
  // unsafeRoleReason below.
  permissions: string
  managed: boolean
}

// Discord's own role settings UI lists the highest-position role first — sort the same way here
// so a role selector's order actually reflects the guild's hierarchy instead of whatever order
// the API happened to return.
export async function getGuildRoles(guildId: string): Promise<DiscordFetchResult<DiscordRoleOption[]>> {
  const result = await discordFetchJson<(DiscordRoleOption & { position: number })[]>(`/guilds/${guildId}/roles`)
  if (!result.ok) return result
  return {
    ok: true,
    data: [...result.data]
      .sort((a, b) => b.position - a.position)
      .map(({ id, name, color, permissions, managed }) => ({ id, name, color, permissions, managed })),
  }
}

const ADMINISTRATOR_PERMISSION_BIT = BigInt(8) // 1 << 3, Discord's ADMINISTRATOR permission flag

// Used wherever a role gets wired into an automated flow, never for roles a human explicitly
// clicks to accept for themselves. `null` means the role is safe to hand real server power to.
export function unsafeRoleReason(role: DiscordRoleOption, guildId: string): string | null {
  if ((BigInt(role.permissions) & ADMINISTRATOR_PERMISSION_BIT) === ADMINISTRATOR_PERMISSION_BIT) {
    return "it has Administrator permission"
  }
  if (role.managed) return "it's managed by a bot or integration"
  if (role.id === guildId) return "it's the @everyone role"
  return null
}

// Same three checks as unsafeRoleReason, applied proactively to a role list rather than reactively
// to one already-picked role - the standard for every role picker, so an admin never sees
// @everyone/managed/Administrator roles as options to begin with. Server-side submit handlers
// should still call unsafeRoleReason directly (pickers have a manual "Enter ID" escape hatch,
// and endpoints are reachable via direct POST regardless of what the UI shows).
// `allowAdministrator` exists for legitimate admin-access-allowlist cases. `alwaysInclude`
// guards a real footgun: an uncontrolled <select> whose already-saved value isn't among the
// rendered options silently falls back to the first option - re-saving an unrelated field
// would then silently overwrite the value. Pass the row's current value(s) so its own dropdown
// keeps showing (and saving) its actual current role even if it would otherwise be filtered.
export function filterAssignableRoles(
  roles: DiscordRoleOption[],
  guildId: string,
  {
    allowAdministrator = false,
    alwaysInclude = [],
  }: { allowAdministrator?: boolean; alwaysInclude?: (string | null | undefined)[] } = {},
): DiscordRoleOption[] {
  const keep = new Set(alwaysInclude.filter((id): id is string => Boolean(id)))
  return roles.filter((role) => {
    if (keep.has(role.id)) return true
    const reason = unsafeRoleReason(role, guildId)
    return reason === null || (allowAdministrator && reason === "it has Administrator permission")
  })
}

export interface DiscordChannelOption {
  id: string
  name: string
}

// GUILD_TEXT (0) and GUILD_ANNOUNCEMENT (5) — the channel types a log/announcement channel can
// actually post to. See https://discord.com/developers/docs/resources/channel#channel-object-channel-types.
const TEXT_POSTABLE_CHANNEL_TYPES = new Set([0, 5])

interface RawDiscordChannel {
  id: string
  name: string
  type: number
  position: number
  parent_id: string | null
}

// GET /guilds/{id}/channels returns channels in no particular order — Discord's own docs only
// promise "channels with the same position are sorted by id" as a tie-break, so every consumer is
// expected to reconstruct display order itself. This mirrors how the real Discord client renders
// a guild's channel list: categories and uncategorized (parent_id null) channels share one
// position sequence at the top level, then each category's own channels are ordered by their
// position among that category's siblings alone. Sorting the full (unfiltered-by-type) list
// first for root rank, then filtering to postable types, preserves the postable subset's
// relative order regardless of how voice/stage channels factor into position numbering.
function sortByGuildDisplayOrder(channels: RawDiscordChannel[]): RawDiscordChannel[] {
  const byPositionThenId = (a: RawDiscordChannel, b: RawDiscordChannel) =>
    a.position - b.position || (BigInt(a.id) < BigInt(b.id) ? -1 : 1)

  const rootRank = new Map(
    channels
      .filter((c) => c.parent_id === null)
      .sort(byPositionThenId)
      .map((c, index) => [c.id, index] as const),
  )

  const postable = channels.filter((c) => TEXT_POSTABLE_CHANNEL_TYPES.has(c.type))
  const categoryIds = new Set(postable.map((c) => c.parent_id).filter((id): id is string => id !== null))
  const childRank = new Map<string, number>()
  for (const categoryId of categoryIds) {
    postable
      .filter((c) => c.parent_id === categoryId)
      .sort(byPositionThenId)
      .forEach((c, index) => childRank.set(c.id, index))
  }

  return [...postable].sort((a, b) => {
    const aRoot = rootRank.get(a.parent_id ?? a.id) ?? Number.MAX_SAFE_INTEGER
    const bRoot = rootRank.get(b.parent_id ?? b.id) ?? Number.MAX_SAFE_INTEGER
    return aRoot !== bRoot ? aRoot - bRoot : (childRank.get(a.id) ?? 0) - (childRank.get(b.id) ?? 0)
  })
}

export async function getGuildChannels(guildId: string): Promise<DiscordFetchResult<DiscordChannelOption[]>> {
  const result = await discordFetchJson<RawDiscordChannel[]>(`/guilds/${guildId}/channels`)
  if (!result.ok) return result
  return {
    ok: true,
    data: sortByGuildDisplayOrder(result.data).map((channel) => ({ id: channel.id, name: channel.name })),
  }
}

export interface DiscordChannelInfo {
  guildId: string | null
  type: number
}

// PUBLIC_THREAD (11), PRIVATE_THREAD (12) and ANNOUNCEMENT_THREAD (10). GET /guilds/{id}/channels
// never lists threads, so a thread can only be recognised by asking for the channel itself.
const THREAD_CHANNEL_TYPES = new Set([10, 11, 12])

export function isThreadChannelType(type: number): boolean {
  return THREAD_CHANNEL_TYPES.has(type)
}

export async function getChannelInfo(channelId: string): Promise<DiscordFetchResult<DiscordChannelInfo>> {
  const result = await discordFetchJson<{ guild_id?: string; type: number }>(`/channels/${channelId}`)
  if (!result.ok) return result
  return { ok: true, data: { guildId: result.data.guild_id ?? null, type: result.data.type } }
}

export async function getGuildEmojis(guildId: string): Promise<DiscordFetchResult<DiscordEmojiOption[]>> {
  const result = await discordFetchJson<{ id: string; name: string; animated: boolean }[]>(
    `/guilds/${guildId}/emojis`,
  )
  if (!result.ok) return result
  return { ok: true, data: result.data.map((e) => ({ id: e.id, name: e.name, animated: e.animated })) }
}

export interface DiscordMemberOption {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

interface RawGuildMember {
  nick: string | null
  user: {
    id: string
    username: string
    global_name: string | null
    avatar: string | null
  }
}

function avatarUrl(userId: string, avatarHash: string | null): string | null {
  if (!avatarHash) return null
  const ext = avatarHash.startsWith("a_") ? "gif" : "png"
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=32`
}

function shapeMember(member: RawGuildMember): DiscordMemberOption {
  return {
    id: member.user.id,
    username: member.user.username,
    displayName: member.nick ?? member.user.global_name ?? member.user.username,
    avatarUrl: avatarUrl(member.user.id, member.user.avatar),
  }
}

// Discord's search does prefix matching on username/nick, not substring or fuzzy matching.
// NOTE: uses the /members/search endpoint, which does NOT require the privileged GUILD_MEMBERS
// intent (that only gates the plural /members list endpoint and gateway member events).
export async function searchGuildMembers(
  guildId: string,
  query: string,
  limit = 10,
): Promise<DiscordFetchResult<DiscordMemberOption[]>> {
  const trimmed = query.trim().slice(0, 100)
  if (trimmed.length < 2) return { ok: true, data: [] }
  const cappedLimit = Math.min(Math.max(Math.trunc(limit) || 10, 1), 10)

  const result = await discordFetchJson<RawGuildMember[]>(
    `/guilds/${guildId}/members/search?query=${encodeURIComponent(trimmed)}&limit=${cappedLimit}`,
  )
  if (!result.ok) return result

  // Discord's search endpoint has been observed returning the same member more than once for a
  // single query (e.g. matching on both nick and username) — dedupe by id so every consumer's
  // `key={member.id}` list rendering can't collide.
  const seen = new Set<string>()
  const deduped: DiscordMemberOption[] = []
  for (const raw of result.data) {
    const shaped = shapeMember(raw)
    if (seen.has(shaped.id)) continue
    seen.add(shaped.id)
    deduped.push(shaped)
  }

  return { ok: true, data: deduped }
}

// Splits into fixed-size batches — used to bound Discord REST fan-out below. Firing all of a
// large page's lookups in one Promise.all is a real candidate for tripping a shared rate-limit
// bucket; a member that silently 429s just renders with its raw ID instead of a name, which
// reads as a bug rather than a rate limit in review.
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

const DISCORD_FETCH_CONCURRENCY = 10

// Resolves already-known Discord user IDs to a display name/avatar for rendering — distinct
// from searchGuildMembers, which is for picking a *new* one. Tolerates individual failures
// (a member who's since left the guild, a transient Discord hiccup) by simply omitting that ID
// from the returned Map rather than failing the whole lookup — callers fall back to the raw ID
// for any id missing from the Map.
export async function getGuildMembers(guildId: string, userIds: string[]): Promise<Map<string, DiscordMemberOption>> {
  const uniqueIds = [...new Set(userIds)]
  const entries: ([string, DiscordMemberOption] | null)[] = []
  for (const batch of chunk(uniqueIds, DISCORD_FETCH_CONCURRENCY)) {
    const batchEntries = await Promise.all(
      batch.map(async (userId): Promise<[string, DiscordMemberOption] | null> => {
        const result = await discordFetchJson<RawGuildMember>(`/guilds/${guildId}/members/${userId}`)
        return result.ok ? [userId, shapeMember(result.data)] : null
      }),
    )
    entries.push(...batchEntries)
  }
  return new Map(entries.filter((entry): entry is [string, DiscordMemberOption] => entry !== null))
}

// A single-member-by-ID fetch, NOT the paginated /members list endpoint, so this does not
// require the privileged GUILD_MEMBERS intent. Returns null for a departed member (404) or any
// other failure.
export async function getGuildMemberRoles(guildId: string, userId: string): Promise<{ roles: string[] } | null> {
  const result = await discordFetchJson<{ roles: string[] }>(`/guilds/${guildId}/members/${userId}`)
  return result.ok ? { roles: result.data.roles } : null
}

export interface GuildPresence {
  /** Whether the bot is actually a member of the guild. */
  botIsMember: boolean
  /** Null when the bot couldn't be asked, not when the guild is nameless. */
  name: string | null
  iconUrl: string | null
}

// Returns the guild icon *and* whether the bot is in the guild at all, from one request.
//
// Worth having because a venue can be linked to a guild the bot isn't in — every role/channel
// picker on such a guild then quietly renders its "type an ID" fallback, which is
// indistinguishable from a broken deployment. It cost real debugging time before this existed.
//
// Absence is only claimed on a definitive 404. A 401/403/429/network failure means we couldn't
// ask, not that the bot is gone, and telling an admin to re-invite a bot that's sitting right
// there would be worse than saying nothing.
export async function getGuildPresence(guildId: string): Promise<GuildPresence> {
  const result = await discordFetchJson<{ name: string; icon: string | null }>(`/guilds/${guildId}`)
  if (result.ok) {
    return { botIsMember: true, name: result.data.name, iconUrl: guildIconUrl(guildId, result.data.icon) }
  }
  return { botIsMember: result.status !== 404, name: null, iconUrl: null }
}
