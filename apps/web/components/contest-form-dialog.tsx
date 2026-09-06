"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import type { GiveawayRow, RaffleRow } from "@/lib/api/xvm-api"

type ContestType = "giveaway" | "raffle"

interface ContestFormDialogProps {
  venueId: string
  trigger?: React.ReactNode
  onCreated: (type: ContestType, contest: GiveawayRow | RaffleRow) => void
}

export function ContestFormDialog({ venueId, trigger, onCreated }: ContestFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [type, setType] = useState<ContestType>("giveaway")

  const [name, setName] = useState("")
  const [prize, setPrize] = useState("")
  const [description, setDescription] = useState("")
  const [costPerTicket, setCostPerTicket] = useState("100000")
  const [winnerBasisPoints, setWinnerBasisPoints] = useState("5000")
  const [numWinners, setNumWinners] = useState("1")
  const [endAt, setEndAt] = useState<Date | undefined>(undefined)
  const [autoNotify, setAutoNotify] = useState(true)

  function reset() {
    setType("giveaway")
    setName("")
    setPrize("")
    setDescription("")
    setCostPerTicket("100000")
    setWinnerBasisPoints("5000")
    setNumWinners("1")
    setEndAt(undefined)
    setAutoNotify(true)
  }

  async function handleSubmit() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error("Please enter a name")
      return
    }
    const winners = Number(numWinners)
    if (!Number.isInteger(winners) || winners < 1 || winners > 50) {
      toast.error("Number of winners must be between 1 and 50")
      return
    }

    setSubmitting(true)
    try {
      if (type === "giveaway") {
        const giveaway = await apiFetch<GiveawayRow>(`/api/venues/${venueId}/contests/giveaways`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            prize: prize.trim() || null,
            description: description.trim() || null,
            numWinners: winners,
            endAt: endAt ? endAt.toISOString() : null,
            autoNotify,
          }),
        })
        onCreated("giveaway", giveaway)
      } else {
        const cost = Number(costPerTicket)
        const basisPoints = Number(winnerBasisPoints)
        if (!Number.isInteger(cost) || cost < 1) {
          toast.error("Cost per ticket must be a positive number")
          setSubmitting(false)
          return
        }
        if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
          toast.error("Winner share must be between 0 and 10000 basis points")
          setSubmitting(false)
          return
        }
        const raffle = await apiFetch<RaffleRow>(`/api/venues/${venueId}/contests/raffles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            costPerTicket: cost,
            winnerBasisPoints: basisPoints,
            numWinners: winners,
            autoNotify,
          }),
        })
        onCreated("raffle", raffle)
      }
      toast.success(`${type === "giveaway" ? "Giveaway" : "Raffle"} created`)
      reset()
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to create contest. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button>New Contest</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Contest</DialogTitle>
          <DialogDescription>Give away a prize, or run a ticketed raffle for a gil pot.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="flex gap-2">
              <Button type="button" variant={type === "giveaway" ? "default" : "outline"} size="sm" onClick={() => setType("giveaway")}>
                Giveaway
              </Button>
              <Button type="button" variant={type === "raffle" ? "default" : "outline"} size="sm" onClick={() => setType("raffle")}>
                Raffle
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contest-name">Name</Label>
            <Input id="contest-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>

          {type === "giveaway" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="contest-prize">Prize</Label>
                <Input id="contest-prize" value={prize} onChange={(e) => setPrize(e.target.value)} maxLength={500} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contest-description">Description</Label>
                <Textarea
                  id="contest-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={1000}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="contest-cost">Cost per ticket (gil)</Label>
                <Input
                  id="contest-cost"
                  type="number"
                  min={1}
                  value={costPerTicket}
                  onChange={(e) => setCostPerTicket(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contest-basis-points">Winner share (basis points, 5000 = 50%)</Label>
                <Input
                  id="contest-basis-points"
                  type="number"
                  min={0}
                  max={10_000}
                  value={winnerBasisPoints}
                  onChange={(e) => setWinnerBasisPoints(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="contest-winners">Number of winners</Label>
            <Input
              id="contest-winners"
              type="number"
              min={1}
              max={50}
              value={numWinners}
              onChange={(e) => setNumWinners(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Ends at (optional)</Label>
            <DateTimePicker date={endAt} onDateChange={setEndAt} placeholder="No end date" />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="contest-auto-notify">Auto-notify winners in Discord</Label>
            <Switch id="contest-auto-notify" checked={autoNotify} onCheckedChange={setAutoNotify} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
