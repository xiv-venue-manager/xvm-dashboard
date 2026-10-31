"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { LogIn, LogOut } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"

interface ClockShiftButtonProps {
  venueSlug: string
  shiftId: number
  action: "clock-in" | "clock-out"
  staffName: string
}

export function ClockShiftButton({ venueSlug, shiftId, action, staffName }: ClockShiftButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch(`/api/venues/${venueSlug}/shifts/${shiftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error || `Failed (${res.status})`)
        return
      }
      router.refresh()
    } catch {
      toast.error("Network error.")
    } finally {
      setLoading(false)
    }
  }

  const isClockIn = action === "clock-in"
  const label = isClockIn ? "Clock in" : "Clock out"

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={isClockIn ? "text-emerald-500 hover:text-emerald-400" : "text-amber-500 hover:text-amber-400"}
          disabled={loading}
          aria-label={`${label} ${staffName}`}
          title={`${label} ${staffName}`}
        >
          {loading ? "..." : isClockIn ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {label} {staffName}?
          </AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleClick}>{label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
