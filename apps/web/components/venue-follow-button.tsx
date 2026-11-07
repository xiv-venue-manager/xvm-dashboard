"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Heart } from "lucide-react"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"

interface VenueFollowButtonProps {
  venueId: string
  isFollowing: boolean
  followCount: number
  compact?: boolean
}

export function VenueFollowButton({
  venueId,
  isFollowing: initial,
  followCount: initialCount,
  compact,
}: VenueFollowButtonProps) {
  const [following, setFollowing] = useState(initial)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    setLoading(true)
    try {
      await apiRoute("/api/venues/[venueId]/follow", { params: { venueId }, method: following ? "DELETE" : "POST" })
      setFollowing(!following)
      setCount((c) => (following ? c - 1 : c + 1))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to update follow status. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (compact) {
    return (
      <button
        onClick={toggle}
        disabled={loading}
        title={following ? `Unfollow (${count})` : `Follow (${count})`}
        className={`p-[7px] rounded-[var(--radius-md)] border transition-colors ${
          following
            ? "border-[var(--blue-020)] bg-[var(--blue-012)] text-[var(--xiv-blue)] hover:bg-[var(--destructive-soft)] hover:text-[var(--destructive)] hover:border-[rgba(243,139,168,0.3)]"
            : "border-[var(--blue-018)] bg-[rgba(7,11,20,0.5)] text-muted-foreground hover:text-[var(--support-pink)] hover:border-[rgba(243,139,168,0.3)] hover:bg-[rgba(243,139,168,0.08)]"
        }`}
      >
        <Heart className={`h-4 w-4 ${following ? "fill-current" : ""}`} />
      </button>
    )
  }

  return (
    <Button
      variant={following ? "default" : "outline-blue"}
      size="sm"
      onClick={toggle}
      disabled={loading}
      className={
        following
          ? "bg-[var(--blue-012)] text-[var(--xiv-blue)] border border-[var(--blue-020)] hover:bg-[var(--destructive-soft)] hover:text-[var(--destructive)] hover:border-[rgba(243,139,168,0.3)]"
          : ""
      }
    >
      <Heart className={`h-3.5 w-3.5 ${following ? "fill-current" : ""}`} />
      {following ? `Following · ${count}` : `Follow · ${count}`}
    </Button>
  )
}
