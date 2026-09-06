"use client"

import { useEffect, useState } from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Copy } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import type { ResolvedEntry } from "@/lib/api/resolve-entry-names"

interface ContestEntriesDrawerProps {
  venueId: string
  contestType: "giveaway" | "raffle"
  contestId: number | null
  contestName: string
  rolled: boolean
  canManage: boolean
  onOpenChange: (open: boolean) => void
}

function entrantLabel(entry: ResolvedEntry): string {
  if (entry.display_name) return entry.display_name
  return `${entry.discord_user_id.slice(0, 4)}...${entry.discord_user_id.slice(-4)}`
}

function entriesPath(venueId: string, contestType: "giveaway" | "raffle", contestId: number): string {
  return contestType === "giveaway"
    ? `/api/venues/${venueId}/contests/giveaways/${contestId}/entries`
    : `/api/venues/${venueId}/contests/raffles/${contestId}/entries`
}

export function ContestEntriesDrawer({
  venueId,
  contestType,
  contestId,
  contestName,
  rolled,
  canManage,
  onOpenChange,
}: ContestEntriesDrawerProps) {
  const [entries, setEntries] = useState<ResolvedEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [creditTarget, setCreditTarget] = useState<string | null>(null)
  const [creditAmount, setCreditAmount] = useState("1")

  useEffect(() => {
    if (contestId === null) return
    let cancelled = false
    setLoading(true)
    setEntries([])
    apiFetch<ResolvedEntry[]>(entriesPath(venueId, contestType, contestId))
      .then((data) => {
        if (!cancelled) setEntries(data)
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof ApiError ? e.message : "Failed to load entries.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [venueId, contestType, contestId])

  async function submitCredit(discordUserId: string) {
    if (contestId === null || contestType !== "raffle") return
    const quantity = Number(creditAmount)
    if (!Number.isInteger(quantity) || quantity < 1) {
      toast.error("Quantity must be a positive whole number")
      return
    }
    try {
      const updated = await apiFetch<ResolvedEntry>(
        `/api/venues/${venueId}/contests/raffles/${contestId}/entries/${discordUserId}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity }) }
      )
      setEntries((prev) => prev.map((e) => (e.discord_user_id === discordUserId ? { ...e, ...updated } : e)))
      toast.success(`Credited ${quantity} ticket(s)`)
      setCreditTarget(null)
      setCreditAmount("1")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to credit tickets.")
    }
  }

  async function removeEntry(discordUserId: string) {
    if (contestId === null || contestType !== "raffle") return
    try {
      await apiFetch(`/api/venues/${venueId}/contests/raffles/${contestId}/entries/${discordUserId}`, {
        method: "DELETE",
      })
      setEntries((prev) => prev.filter((e) => e.discord_user_id !== discordUserId))
      toast.success("Entry removed")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove entry.")
    }
  }

  const sorted = [...entries].sort((a, b) => {
    const rankA = a.winner_rank ?? Number.MAX_SAFE_INTEGER
    const rankB = b.winner_rank ?? Number.MAX_SAFE_INTEGER
    return rankA - rankB
  })

  return (
    <Sheet open={contestId !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{contestName}</SheetTitle>
          <SheetDescription>{entries.length} entrant(s)</SheetDescription>
        </SheetHeader>

        <div className="px-6 pb-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading entries...</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entrant</TableHead>
                  {contestType === "raffle" && <TableHead>Tickets</TableHead>}
                  <TableHead>Rank</TableHead>
                  {canManage && contestType === "raffle" && !rolled && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((entry) => (
                  <TableRow key={entry.discord_user_id}>
                    <TableCell className="flex items-center gap-1.5">
                      {entrantLabel(entry)}
                      {!entry.display_name && (
                        <button
                          type="button"
                          title="Copy Discord ID"
                          aria-label="Copy Discord ID"
                          onClick={() => {
                            navigator.clipboard
                              .writeText(entry.discord_user_id)
                              .then(() => toast.success("Discord ID copied"))
                              .catch(() => toast.error("Failed to copy Discord ID"))
                          }}
                        >
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </TableCell>
                    {contestType === "raffle" && <TableCell>{entry.quantity}</TableCell>}
                    <TableCell>{entry.winner_rank ?? "—"}</TableCell>
                    {canManage && contestType === "raffle" && !rolled && (
                      <TableCell>
                        {creditTarget === entry.discord_user_id ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min={1}
                              value={creditAmount}
                              onChange={(e) => setCreditAmount(e.target.value)}
                              className="h-7 w-16"
                            />
                            <Button size="sm" variant="outline" onClick={() => submitCredit(entry.discord_user_id)}>
                              Add
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setCreditTarget(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => setCreditTarget(entry.discord_user_id)}>
                              Credit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => removeEntry(entry.discord_user_id)}>
                              Remove
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
