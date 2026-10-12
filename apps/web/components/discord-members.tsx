"use client"

import { useEffect, useRef, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { initials } from "@/lib/discord-picker-state"
import { batches, unresolvedIds, MAX_RESOLVE, type DiscordMember } from "@/lib/discord-member-state"

/**
 * Names for Discord ids a page already holds, from the `?ids=` half of the members route.
 *
 * Every id not asked for before is asked for, in as many requests as the route's cap needs, and
 * never twice — see `unresolvedIds` for why "absent from the answer" is permanent rather than a
 * reason to retry. Failures are silent on purpose: the caller falls back to the shortened id,
 * which is what it showed before this existed, so losing Discord costs a name and nothing else.
 */
export function useResolvedMembers(venueId: string, ids: string[]): Record<string, DiscordMember> {
  const [members, setMembers] = useState<Record<string, DiscordMember>>({})
  const asked = useRef<Set<string>>(new Set())
  const requested = ids.filter((id) => id !== "").join(",")

  useEffect(() => {
    const wanted = unresolvedIds(requested === "" ? [] : requested.split(","), asked.current)
    if (wanted.length === 0) return
    for (const id of wanted) asked.current.add(id)

    // No AbortController here, unlike a search: batches are disjoint by construction, so a slow
    // answer can only add names that nothing else was going to supply. Aborting on a re-run —
    // which is what appending to the id list does — would drop a batch already marked as asked
    // and lose those names for the life of the page.
    for (const batch of batches(wanted, MAX_RESOLVE)) {
      fetch(`/api/venues/${venueId}/discord/members?ids=${batch.join(",")}`)
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status))
          return response.json()
        })
        .then((body: { members?: Record<string, DiscordMember> }) => {
          if (body.members) setMembers((prev) => ({ ...prev, ...body.members }))
        })
        .catch(() => {
          // An id missing from an answer that arrived is permanently missing, so it stays asked.
          // No answer at all says nothing about the id — unmark the batch so the next run retries.
          for (const id of batch) asked.current.delete(id)
        })
    }
  }, [venueId, requested])

  return members
}

/**
 * A resolved member's avatar and name, or initials beside whatever label the caller decided on.
 *
 * Deliberately dumb: `memberLabel` already chose between a name and a shortened id, and that
 * choice is pure and tested, so this only renders. The fallback means a row for somebody who has
 * left the server is the same height and shape as every other one.
 */
export function MemberChip({
  label,
  avatarUrl,
  className,
}: {
  label: string
  avatarUrl?: string | null
  className?: string
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className ?? ""}`}>
      <Avatar className="size-5 flex-none">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className="text-[9px] font-medium">{initials(label)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{label}</span>
    </span>
  )
}
