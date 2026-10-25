"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
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
}

export function DeleteShiftButton({ venueSlug, shiftId, hasPayroll }: DeleteShiftButtonProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

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
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={deleting}
          aria-label="Delete shift"
        >
          {deleting ? "..." : <Trash2 className="h-4 w-4" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hasPayroll ? "Delete this shift and its linked payroll entry?" : "Delete this shift?"}
          </AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
