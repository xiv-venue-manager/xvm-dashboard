"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import type { GiveawayRow, RaffleRow, GiveawayRoll, RaffleRoll } from "@/lib/api/xvm-api"

type Contest = ({ kind: "giveaway" } & GiveawayRow) | ({ kind: "raffle" } & RaffleRow)

export interface ContestsBoardProps {
  venueId: string
  canManage: boolean
  giveaways: GiveawayRow[]
  raffles: RaffleRow[]
  notConnected?: boolean
}

const NOT_CONNECTED_MESSAGE = "Ask the venue owner to connect this venue to xvm-api first."

function winnerNames(winners: { discord_user_id: string }[]): string {
  return winners.map((w) => `${w.discord_user_id.slice(0, 4)}...${w.discord_user_id.slice(-4)}`).join(", ")
}

function rollPath(venueId: string, kind: "giveaway" | "raffle", id: number): string {
  return kind === "giveaway"
    ? `/api/venues/${venueId}/contests/giveaways/${id}/roll`
    : `/api/venues/${venueId}/contests/raffles/${id}/roll`
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

export function ContestsBoard({ venueId, canManage, giveaways, raffles, notConnected }: ContestsBoardProps) {
  const [contests, setContests] = useState<Contest[]>([
    ...giveaways.map((g) => ({ kind: "giveaway" as const, ...g })),
    ...raffles.map((r) => ({ kind: "raffle" as const, ...r })),
  ])
  const [rollTarget, setRollTarget] = useState<Contest | null>(null)
  const [rolling, setRolling] = useState(false)
  const [openEntries, setOpenEntries] = useState<Contest | null>(null)
  const [rolledWinners, setRolledWinners] = useState<Record<string, string>>({})

  function contestKey(c: Contest): string {
    return `${c.kind}:${c.id}`
  }

  function handleCreated(kind: "giveaway" | "raffle", contest: GiveawayRow | RaffleRow) {
    setContests((prev) => [{ kind, ...contest } as Contest, ...prev])
  }

  async function confirmRoll() {
    if (!rollTarget) return
    setRolling(true)
    try {
      const result = await apiFetch<GiveawayRoll | RaffleRoll>(rollPath(venueId, rollTarget.kind, rollTarget.id), {
        method: "POST",
      })
      const names = winnerNames(result.winners)
      setRolledWinners((prev) => ({ ...prev, [contestKey(rollTarget)]: names }))
      setContests((prev) =>
        prev.map((c) => (contestKey(c) === contestKey(rollTarget) ? { ...c, rolled_at: new Date().toISOString() } : c))
      )
      toast.success(`Winner${result.winners.length > 1 ? "s" : ""} rolled: ${names}`)
      setRollTarget(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("This draw was already rolled by someone else.")
        fetchContests(venueId)
          .then(setContests)
          .catch(() => {
            /* keep stale data over crashing; card will just look pre-roll until next load */
          })
      } else {
        toast.error(e instanceof ApiError ? e.message : "Failed to roll winner.")
      }
    } finally {
      setRolling(false)
      setRollTarget(null)
    }
  }

  if (notConnected) {
    return (
      <Alert>
        <AlertDescription>{NOT_CONNECTED_MESSAGE}</AlertDescription>
      </Alert>
    )
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
                  {isRolled && rolledWinners[contestKey(c)] && (
                    <p className="text-sm mt-2 text-[var(--xiv-blue)]">Winner: {rolledWinners[contestKey(c)]}</p>
                  )}
                  {canManage && !isRolled && (
                    <Button
                      size="sm"
                      className="w-full mt-3"
                      onClick={(e) => {
                        e.stopPropagation()
                        setRollTarget(c)
                      }}
                    >
                      Roll
                    </Button>
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
            <AlertDialogAction onClick={confirmRoll} disabled={rolling}>
              {rolling ? "Rolling..." : "Roll"}
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
