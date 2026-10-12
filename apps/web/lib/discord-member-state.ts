export interface DiscordMember {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

/** How many ids one `?ids=` request may carry before the route truncates it server-side. */
export const MAX_RESOLVE = 50

/**
 * The ids still worth asking about: ones never asked for, deduped.
 *
 * Keyed on *asked*, not on *found*. `getGuildMembers` omits a member who has left rather than
 * reporting them, so an id that will never resolve stays missing from every answer — ask on "do
 * we have a name for this yet" and a page full of departed members re-requests all of them on
 * every render.
 *
 * Uncapped, and split by `batches` at the request site. Capping here dropped the overflow
 * instead of asking for it, because nothing re-runs once the id list has stopped changing.
 */
export function unresolvedIds(ids: string[], asked: Set<string>): string[] {
  const wanted: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (id === "" || asked.has(id) || seen.has(id)) continue
    seen.add(id)
    wanted.push(id)
  }
  return wanted
}

/** Successive slices of at most `size`, so one over-long list becomes several legal requests. */
export function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * What to show for a Discord id: the member's name, or a shortened id.
 *
 * The fallback keeps the shape the contest tables already used, so a row for someone who has left
 * the server reads exactly as it did before any of this resolved names. Short input is returned
 * whole — shortening "123" to "123...123" would be longer than the thing it shortens.
 */
export function memberLabel(id: string, member: DiscordMember | undefined): string {
  if (member) return member.displayName
  if (id.length <= 9) return id
  return `${id.slice(0, 4)}...${id.slice(-4)}`
}
