import { listMemberships, type EntryRow } from "@/lib/api/xvm-api"
import { resolveDisplayName } from "@/lib/display-name"

export interface ResolvedEntry extends EntryRow {
  display_name: string | null
}

/**
 * discord_user_id entries carry no username. A manager's roster read gives each member's Discord id
 * with the venue's nickname for them, so entrants who work at the venue get that name. Anyone else
 * stays null and the caller falls back to their live Discord name. A failed roster read leaves every
 * name null rather than failing the entries.
 */
export async function resolveEntryNames(
  token: string,
  xvmApiVenueId: string,
  entries: EntryRow[]
): Promise<ResolvedEntry[]> {
  if (entries.length === 0) return []
  const nameByDiscordId = new Map<string, string>()
  try {
    for (const member of await listMemberships(token, xvmApiVenueId)) {
      if (member.person.discord_id) {
        nameByDiscordId.set(
          member.person.discord_id,
          resolveDisplayName({ nickname: member.nickname, displayName: member.person.display_name })
        )
      }
    }
  } catch (err) {
    console.error("[resolve-entry-names] roster read error:", err)
  }
  return entries.map((e) => ({ ...e, display_name: nameByDiscordId.get(e.discord_user_id) ?? null }))
}
