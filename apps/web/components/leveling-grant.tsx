"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserPicker } from "@/components/user-picker"
import { useResolvedMembers } from "@/components/discord-members"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import type { LevelingAwardResult, LevelingStanding } from "@/lib/api/xvm-api"

export interface LevelingGrantProps {
  venueId: string
  xpName: string
  onGranted: (standing: LevelingStanding) => void
}

export function LevelingGrant({ venueId, xpName, onGranted }: LevelingGrantProps) {
  const [userId, setUserId] = useState("")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const members = useResolvedMembers(venueId, userId === "" ? [] : [userId])

  async function grant() {
    const xp = Number(amount)
    if (!SNOWFLAKE_PATTERN.test(userId)) {
      toast.error("Pick the person to give it to.")
      return
    }
    if (!Number.isInteger(xp) || xp < 1 || xp > 1_000_000) {
      toast.error(`The ${xpName} amount is a whole number from 1 to 1,000,000.`)
      return
    }
    setBusy(true)
    try {
      const result = await apiRoute<LevelingAwardResult>("/api/venues/[venueId]/leveling/awards", {
        params: { venueId },
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discordUserId: userId,
          displayName: members[userId]?.displayName ?? userId,
          amount: xp,
          note,
        }),
      })
      onGranted(result.standing)
      setUserId("")
      setAmount("")
      setNote("")
      toast.success(
        result.leveled_up
          ? `${result.standing.name} got ${result.xp_amount} ${xpName} and reached level ${result.standing.level}.`
          : `${result.standing.name} got ${result.xp_amount} ${xpName}.`
      )
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : `Failed to grant ${xpName}.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="font-semibold">Grant {xpName} by hand</p>
          <p className="text-sm text-muted-foreground">Shows in their award history with your note.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="leveling-grant-user">Person</Label>
          <UserPicker venueId={venueId} value={userId} onChange={setUserId} disabled={busy} id="leveling-grant-user" />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <Label htmlFor="leveling-grant-amount">{xpName}</Label>
            <Input id="leveling-grant-amount" type="number" min={1} max={1000000} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} className="w-32" />
          </div>
          <div className="min-w-[12rem] flex-1 space-y-2">
            <Label htmlFor="leveling-grant-note">Note</Label>
            <Input id="leveling-grant-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} disabled={busy} />
          </div>
        </div>
        <Button onClick={grant} disabled={busy}>
          {busy ? "Granting..." : `Grant ${xpName}`}
        </Button>
      </CardContent>
    </Card>
  )
}
