"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface ClaimedShiftChipProps {
  shiftId: number
  venueSlug: string
  timeLabel: string
  canManage: boolean
}

export function ClaimedShiftChip({ shiftId, venueSlug, timeLabel, canManage }: ClaimedShiftChipProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAction(action: "approve" | "reject") {
    setLoading(action)
    setError(null)
    const res = await fetch(`/api/venues/${venueSlug}/shifts/${shiftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Failed")
      setLoading(null)
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-0.5 items-start">
      <span className="shift-chip bg-violet-500/10 text-violet-400 border-violet-500/20">{timeLabel}</span>
      {canManage && (
        <div className="flex gap-1">
          <button
            onClick={() => handleAction("approve")}
            disabled={loading !== null}
            className="text-[0.62rem] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {loading === "approve" ? "..." : "Approve"}
          </button>
          <button
            onClick={() => handleAction("reject")}
            disabled={loading !== null}
            className="text-[0.62rem] font-semibold px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            {loading === "reject" ? "..." : "Reject"}
          </button>
        </div>
      )}
      {error && <p className="text-[0.6rem] text-red-400">{error}</p>}
    </div>
  )
}
