import type { MyVenue } from "@/lib/api/venue-access"
import type { VenueLinkRow } from "@/lib/api/xvm-api"
import { ApiError, apiFetch } from "@/lib/api-fetch"
import type { GuildAuthority } from "@/lib/discord-user"
import { validators } from "@/lib/validation"

export interface ConnectServer {
  id: string
  name: string | null
  iconUrl: string | null
}

export interface ConnectableVenue {
  id: string
  slug: string
  name: string
  world: string
  dataCenter: string
  connectedElsewhere: boolean
}

export type ConnectView =
  | { kind: "bad-link" }
  | { kind: "bot-absent" }
  | { kind: "reauth" }
  | { kind: "not-manager" }
  | { kind: "unavailable" }
  | { kind: "connected"; venue: { name: string; slug: string } | null }
  | { kind: "choose"; venues: ConnectableVenue[] }

export function guildIdFrom(param: string | string[] | undefined): string | null {
  return typeof param === "string" && validators.snowflake.safeParse(param).success ? param : null
}

export function signInUrl(returnTo: string): string {
  return `/auth/signin?callbackUrl=${encodeURIComponent(returnTo)}`
}

export function ownedVenues(mine: MyVenue[]): MyVenue[] {
  return mine.filter((v) => v.role === "OWNER")
}

export function hasLiveServer(venue: { external_links: VenueLinkRow[] }): boolean {
  return venue.external_links.some((link) => link.provider === "DiscordGuild" && link.unlinked_at === null)
}

// A server connected to someone else's venue is named only as "a venue": anyone signed in can open
// this page for any server id, and the bot's own menu is where its members learn which venue it is.
// Whether a server is connected is shown to anyone, since there is nothing a non-manager could do
// about it either way; only the offer to connect waits on Manage Server.
export function connectView({
  botIsMember,
  authority,
  current,
  mine,
  connectedElsewhere,
}: {
  botIsMember: boolean
  authority: GuildAuthority
  current: { id: string } | null | "unavailable"
  mine: MyVenue[] | "unavailable"
  connectedElsewhere: ReadonlySet<string>
}): ConnectView {
  if (!botIsMember) return { kind: "bot-absent" }
  if (current === "unavailable" || mine === "unavailable") return { kind: "unavailable" }
  if (current) {
    const venue = mine.find((v) => v.id === current.id)
    return { kind: "connected", venue: venue ? { name: venue.name, slug: venue.slug } : null }
  }
  if (!authority.ok) return { kind: authority.failure === "reauth_required" ? "reauth" : "unavailable" }
  if (!authority.administers) return { kind: "not-manager" }
  return {
    kind: "choose",
    venues: ownedVenues(mine).map((v) => ({
      id: v.id,
      slug: v.slug,
      name: v.name,
      world: v.world,
      dataCenter: v.dataCenter,
      connectedElsewhere: connectedElsewhere.has(v.id),
    })),
  }
}

export async function connectServer(venueRef: string, guildId: string): Promise<string | null> {
  try {
    await apiFetch(`/api/venues/${venueRef}/discord/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guildId }),
    })
    return null
  } catch (err) {
    return err instanceof ApiError ? err.message : "Couldn't connect that server."
  }
}
