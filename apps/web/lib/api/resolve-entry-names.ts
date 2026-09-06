import { prisma } from "@/lib/prisma"
import type { EntryRow } from "@/lib/api/xvm-api"

export interface ResolvedEntry extends EntryRow {
  display_name: string | null
}

/**
 * discord_user_id entries carry no username - resolve against linked accounts
 * (User.discordId) in one batched query, falling back to null (the caller
 * renders a truncated id) for anyone who hasn't linked their Discord account.
 */
export async function resolveEntryNames(entries: EntryRow[]): Promise<ResolvedEntry[]> {
  if (entries.length === 0) return []
  const discordIds = entries.map((e) => e.discord_user_id)
  const users = await prisma.user.findMany({
    where: { discordId: { in: discordIds } },
    select: { discordId: true, displayName: true, name: true },
  })
  const nameByDiscordId = new Map(users.map((u) => [u.discordId as string, u.displayName ?? u.name ?? null]))
  return entries.map((e) => ({ ...e, display_name: nameByDiscordId.get(e.discord_user_id) ?? null }))
}
