"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { Trash2, Repeat, Layers } from "lucide-react"
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

interface DeleteShiftButtonProps {
  venueSlug: string
  shiftId: number
  hasPayroll: boolean
  isRecurring?: boolean
  slotGroupId?: string | null
}

export function DeleteShiftButton({
  venueSlug,
  shiftId,
  hasPayroll,
  isRecurring,
  slotGroupId,
}: DeleteShiftButtonProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function cancelVia(endpoint: "cancel-series" | "cancel-group") {
    setDeleting(true)
    try {
      const res = await fetch(`/api/venues/${venueSlug}/shifts/${shiftId}/${endpoint}`, {
        method: "POST",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || `Cancel failed (${res.status})`)
        return
      }
      router.refresh()
    } catch {
      alert("Network error cancelling series.")
    } finally {
      setDeleting(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/venues/${venueSlug}/shifts/${shiftId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || `Delete failed (${res.status})`)
        return
      }
      router.refresh()
    } catch {
      alert("Network error deleting shift.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={
              isRecurring ? "text-amber-400 hover:text-amber-400" : "text-destructive hover:text-destructive"
            }
            disabled={deleting}
            aria-label={isRecurring ? "Cancel this slot" : "Delete shift"}
          >
            {deleting ? "..." : isRecurring ? <Repeat className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isRecurring
                ? "Cancel this recurring series?"
                : hasPayroll
                  ? "Delete this shift and its linked payroll entry?"
                  : "Delete this shift?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isRecurring
                ? "All future instances of this slot will be cancelled. This cannot be undone."
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => (isRecurring ? cancelVia("cancel-series") : handleDelete())}>
              {isRecurring ? "Cancel series" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {isRecurring && slotGroupId && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-amber-400 hover:text-amber-400"
              disabled={deleting}
              aria-label="Cancel all slots"
            >
              {deleting ? "..." : <Layers className="h-4 w-4" />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel all slots in this group?</AlertDialogTitle>
              <AlertDialogDescription>
                All future instances of every slot will be cancelled. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => cancelVia("cancel-group")}>Cancel all</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
