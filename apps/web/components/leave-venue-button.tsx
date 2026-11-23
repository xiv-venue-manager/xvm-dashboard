"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { toast } from "sonner"
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

interface LeaveVenueButtonProps {
  venueSlug: string
  venueName: string
}

export function LeaveVenueButton({ venueSlug, venueName }: LeaveVenueButtonProps) {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)

  async function handleLeave() {
    setLeaving(true)
    try {
      const res = await fetch(`/api/venues/${venueSlug}/staff/me`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error || `Could not leave venue (${res.status})`)
        return
      }
      toast.success(`You left ${venueName}.`)
      router.push("/dashboard")
      router.refresh()
    } catch {
      toast.error("Network error leaving venue.")
    } finally {
      setLeaving(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={leaving}>
          <LogOut className="h-4 w-4 mr-1.5" />
          {leaving ? "Leaving…" : "Leave venue"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave {venueName}?</AlertDialogTitle>
          <AlertDialogDescription>
            You will lose access to this venue&apos;s dashboard. Your positions, upcoming shifts and open tasks here
            are removed, and any shift you are clocked into ends. A manager can add you back later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleLeave}>Leave venue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
