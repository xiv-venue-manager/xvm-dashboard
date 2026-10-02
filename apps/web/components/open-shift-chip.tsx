"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface OpenShiftChipProps {
  shiftId: string
  venueId: string
  timeLabel: string
}

export function OpenShiftChip({ shiftId, venueId, timeLabel }: OpenShiftChipProps) {
  const router = useRouter()
  const [step, setStep] = useState<"idle" | "confirm" | "loading" | "pending">("idle")
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setStep("loading")
    setError(null)
    const res = await fetch(`/api/venues/${venueId}/shifts/${shiftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim" }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Failed to claim shift")
      setStep("idle")
      return
    }
    setStep("pending")
    setTimeout(() => router.refresh(), 2000)
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="shift-chip op">{timeLabel}</span>

      {step === "idle" && (
        <button
          onClick={() => setStep("confirm")}
          className="text-[0.62rem] font-semibold px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors self-start"
        >
          Claim
        </button>
      )}

      {step === "confirm" && (
        <div className="flex flex-col gap-1 p-1.5 rounded border border-amber-500/40 bg-amber-500/08 text-[0.6rem] leading-snug">
          <p className="text-amber-300 font-semibold">Claim this shift?</p>
          <p className="text-[var(--fg-faint)]">{timeLabel}</p>
          <p className="text-[var(--fg-faint)]">Your claim goes to a manager for approval.</p>
          <div className="flex gap-1.5 mt-0.5">
            <button
              onClick={handleConfirm}
              className="font-semibold px-1.5 py-0.5 rounded border border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setStep("idle")}
              className="px-1.5 py-0.5 rounded text-[var(--fg-faint)] hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "loading" && <span className="text-[0.62rem] text-[var(--fg-faint)]">Claiming…</span>}

      {step === "pending" && (
        <span className="text-[0.62rem] font-semibold text-emerald-400">Claimed — awaiting approval</span>
      )}

      {error && <p className="text-[0.6rem] text-red-400">{error}</p>}
    </div>
  )
}
