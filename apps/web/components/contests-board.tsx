"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ContestFormDialog } from "@/components/contest-form-dialog"
import { ContestEntriesDrawer } from "@/components/contest-entries-drawer"
import { ChannelPicker } from "@/components/discord-picker"
import { useResolvedMembers } from "@/components/discord-members"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import { memberLabel } from "@/lib/discord-member-state"
import { formatServerTime, SERVER_TIME_LABEL } from "@/lib/server-time"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import type { ResolvedEntry } from "@/lib/api/resolve-entry-names"
import type { GiveawayRow, RaffleRow, GiveawayRoll, RaffleRoll } from "@/lib/api/xvm-api"

type Contest = ({ kind: "giveaway" } & GiveawayRow) | ({ kind: "raffle" } & RaffleRow)

export interface ContestsBoardProps {
  venueId: string
  canManage: boolean
  giveaways: GiveawayRow[]
  raffles: RaffleRow[]
}

interface Winner {
  discord_user_id: string
  display_name?: string | null
}

const WINNER_LOOKUPS = 12
const CLOCK_TICK_MS = 30_000

function contestPath(venueId: string, kind: "giveaway" | "raffle", id: number, action: string): string {
  return `/api/venues/${venueId}/contests/${kind === "giveaway" ? "giveaways" : "raffles"}/${id}/${action}`
}

function winnersOf(entries: ResolvedEntry[]): Winner[] {
  return entries
    .filter((e) => e.won_at !== null)
    .sort((a, b) => (a.winner_rank ?? 0) - (b.winner_rank ?? 0))
    .map((e) => ({ discord_user_id: e.discord_user_id, display_name: e.display_name }))
}

function endState(c: Contest, now: number | null): { label: string; ended: boolean } | null {
  if (c.kind !== "giveaway" || c.rolled_at !== null || !c.end_at) return null
  if (now !== null && new Date(c.end_at).getTime() <= now) return { label: "Ended, drawing shortly", ended: true }
  return { label: `Ends ${formatServerTime(new Date(c.end_at), "datetime")} ${SERVER_TIME_LABEL}`, ended: false }
}

async function fetchContests(venueId: string): Promise<Contest[]> {
  const [giveaways, raffles] = await Promise.all([
    apiFetch<GiveawayRow[]>(`/api/venues/${venueId}/contests/giveaways?include_rolled=true`),
    apiFetch<RaffleRow[]>(`/api/venues/${venueId}/contests/raffles?include_rolled=true`),
  ])
  return [
    ...giveaways.map((g) => ({ kind: "giveaway" as const, ...g })),
    ...raffles.map((r) => ({ kind: "raffle" as const, ...r })),
  ]
}

export function ContestsBoard({ venueId, canManage, giveaways, raffles }: ContestsBoardProps) {
  const [contests, setContests] = useState<Contest[]>([
    ...giveaways.map((g) => ({ kind: "giveaway" as const, ...g })),
    ...raffles.map((r) => ({ kind: "raffle" as const, ...r })),
  ])
  const [rollTarget, setRollTarget] = useState<Contest | null>(null)
  const [rerollTarget, setRerollTarget] = useState<Contest | null>(null)
  const [rolling, setRolling] = useState(false)
  const [openEntries, setOpenEntries] = useState<Contest | null>(null)
  const [winnersByContest, setWinnersByContest] = useState<Record<string, Winner[]>>({})
  const [postTarget, setPostTarget] = useState<Contest | null>(null)
  const [postChannelId, setPostChannelId] = useState("")
  const [posting, setPosting] = useState(false)
  const [now, setNow] = useState<number | null>(null)
  const winnersRequested = useRef<Set<string>>(new Set())

  function contestKey(c: Contest): string {
    return `${c.kind}:${c.id}`
  }

  function handleCreated(kind: "giveaway" | "raffle", contest: GiveawayRow | RaffleRow) {
    setContests((prev) => [{ kind, ...contest } as Contest, ...prev])
  }

  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const every = setInterval(tick, CLOCK_TICK_MS)
    return () => {
      clearTimeout(first)
      clearInterval(every)
    }
  }, [])

  useEffect(() => {
    const wanted = contests
      .filter((c) => c.rolled_at !== null)
      .sort((a, b) => new Date(b.rolled_at as string).getTime() - new Date(a.rolled_at as string).getTime())
      .slice(0, WINNER_LOOKUPS)
      .filter((c) => !winnersRequested.current.has(contestKey(c)))
    for (const c of wanted) winnersRequested.current.add(contestKey(c))
    for (const c of wanted) {
      apiFetch<ResolvedEntry[]>(contestPath(venueId, c.kind, c.id, "entries"))
        .then((entries) => setWinnersByContest((prev) => ({ ...prev, [contestKey(c)]: winnersOf(entries) })))
        .catch(() => winnersRequested.current.delete(contestKey(c)))
    }
  }, [venueId, contests])

  const winnerIds = Object.values(winnersByContest).flatMap((winners) => winners.map((w) => w.discord_user_id))
  const members = useResolvedMembers(venueId, winnerIds)

  function winnerLabel(w: Winner): string {
    return w.display_name || memberLabel(w.discord_user_id, members[w.discord_user_id])
  }

  async function runRoll(target: Contest, reroll: boolean) {
    setRolling(true)
    try {
      const result = await apiFetch<GiveawayRoll | RaffleRoll>(
        `${contestPath(venueId, target.kind, target.id, "roll")}${reroll ? "?reroll=true" : ""}`,
        { method: "POST" }
      )
      const key = contestKey(target)
      winnersRequested.current.add(key)
      setWinnersByContest((prev) => ({
        ...prev,
        [key]: result.winners.map((w) => ({ discord_user_id: w.discord_user_id })),
      }))
      setContests((prev) => prev.map((c) => (contestKey(c) === key ? { ...c, rolled_at: new Date().toISOString() } : c)))
      toast.success(
        `Winner${result.winners.length > 1 ? "s" : ""} ${reroll ? "re-rolled" : "rolled"}. The post updates shortly.`
      )
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error(e.message || "This draw was already rolled by someone else.")
        winnersRequested.current.delete(contestKey(target))
        fetchContests(venueId)
          .then(setContests)
          .catch(() => {
            /* keep stale data over crashing; card will just look pre-roll until next load */
          })
      } else {
        toast.error(e instanceof ApiError ? e.message : `Failed to ${reroll ? "re-roll" : "roll"} winner.`)
      }
    } finally {
      setRolling(false)
      setRollTarget(null)
      setRerollTarget(null)
    }
  }

  async function confirmPost() {
    if (!postTarget) return
    if (!SNOWFLAKE_PATTERN.test(postChannelId)) {
      toast.error("Choose a channel.")
      return
    }
    setPosting(true)
    try {
      await apiFetch(contestPath(venueId, postTarget.kind, postTarget.id, "posts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: postChannelId }),
      })
      toast.success("Posting now. It should appear in the channel shortly.")
      setPostTarget(null)
      setPostChannelId("")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to post contest.")
    } finally {
      setPosting(false)
    }
  }

  return (
    <div>
      {canManage && (
        <div className="mb-4">
          <ContestFormDialog venueId={venueId} onCreated={handleCreated} />
        </div>
      )}

      {contests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contests yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contests.map((c) => {
            const isRolled = c.rolled_at !== null
            const entryCount = c.entry_count
            return (
              <Card key={contestKey(c)} className="cursor-pointer" onClick={() => setOpenEntries(c)}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <Badge variant={c.kind === "giveaway" ? "type-giveaway" : "type-raffle"}>
                    {c.kind === "giveaway" ? "Giveaway" : "Raffle"}
                  </Badge>
                  <Badge variant={isRolled ? "tag" : "status-open"}>{isRolled ? "Rolled" : "Open"}</Badge>
                </CardHeader>
                <CardContent>
                  <p className="font-semibold">{c.name ?? `#${c.id}`}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.kind === "giveaway"
                      ? c.prize ?? "No prize set"
                      : `${(c.pot / 1_000_000).toFixed(2)}M gil pot · ${(c.cost_per_ticket / 1000).toFixed(0)}k/ticket`}
                    {" · "}
                    {entryCount} entries
                  </p>
                  {endState(c, now) && (
                    <p className="text-sm mt-1 text-muted-foreground">{endState(c, now)?.label}</p>
                  )}
                  {isRolled && (winnersByContest[contestKey(c)]?.length ?? 0) > 0 && (
                    <p className="text-sm mt-2 text-[var(--xiv-blue)]">
                      {winnersByContest[contestKey(c)].length > 1 ? "Winners" : "Winner"}:{" "}
                      {winnersByContest[contestKey(c)].map(winnerLabel).join(", ")}
                    </p>
                  )}
                  {canManage && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline-blue"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPostTarget(c)
                        }}
                      >
                        Post
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isRolled) setRerollTarget(c)
                          else setRollTarget(c)
                        }}
                      >
                        {isRolled ? "Re-roll" : "Roll"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!rollTarget} onOpenChange={(open) => !open && setRollTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Roll {rollTarget?.num_winners ?? 1} winner{(rollTarget?.num_winners ?? 1) > 1 ? "s" : ""} from{" "}
              {rollTarget?.entry_count ?? 0} entries?
            </AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rolling}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => rollTarget && runRoll(rollTarget, false)} disabled={rolling}>
              {rolling ? "Rolling..." : "Roll"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rerollTarget} onOpenChange={(open) => !open && setRerollTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-roll &quot;{rerollTarget?.name ?? `#${rerollTarget?.id}`}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This draws afresh and replaces the current winners. The post is redrawn, the old announcement comes
              down, and a new one pings the new winners{rerollTarget?.auto_notify ? ", who are also DMed" : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rolling}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => rerollTarget && runRoll(rerollTarget, true)} disabled={rolling}>
              {rolling ? "Re-rolling..." : "Re-roll"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!postTarget}
        onOpenChange={(open) => {
          if (!open) {
            setPostTarget(null)
            setPostChannelId("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post &quot;{postTarget?.name ?? `#${postTarget?.id}`}&quot; to a channel</AlertDialogTitle>
            <AlertDialogDescription>
              {postTarget?.kind === "raffle"
                ? "A raffle's post is a read-only tracker of the pot. It keeps itself up to date as tickets are credited and when it rolls."
                : "A giveaway's post carries the Enter button members join with. It keeps itself up to date as entries come in and when it rolls."}{" "}
              Posting to a channel that already has a copy redraws it instead of adding another.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ChannelPicker venueId={venueId} value={postChannelId} onChange={setPostChannelId} disabled={posting} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={posting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPost} disabled={posting || !postChannelId}>
              {posting ? "Posting..." : "Post"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ContestEntriesDrawer
        venueId={venueId}
        contestType={openEntries?.kind ?? "giveaway"}
        contestId={openEntries?.id ?? null}
        contestName={openEntries?.name ?? ""}
        rolled={openEntries?.rolled_at !== null && openEntries?.rolled_at !== undefined}
        canManage={canManage}
        onOpenChange={(open) => !open && setOpenEntries(null)}
      />
    </div>
  )
}
