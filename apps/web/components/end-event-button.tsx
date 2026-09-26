"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface EndEventButtonProps {
  venueId: string
  eventId: string
}

export function EndEventButton({ venueId, eventId }: EndEventButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [error, setError] = useState("")

  const handleEnd = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setIsEnding(true)
    setError("")
    try {
      const res = await fetch(`/api/venues/${venueId}/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endTime: new Date().toISOString() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to end event")
      }
      router.refresh()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end event")
    } finally {
      setIsEnding(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError("")
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          End
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End this event now?</AlertDialogTitle>
          <AlertDialogDescription>
            Moves its end time to now, so it counts as Completed instead of waiting for its scheduled end time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleEnd} disabled={isEnding}>
            {isEnding ? "Ending…" : "End event"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
