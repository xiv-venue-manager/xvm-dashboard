"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { LocalTime } from "@/components/server-time"

interface PotDistributionSummary {
  generatedAt: string
  recipientCount: number
  perPersonShare: string
}

interface GeneratePotPayrollButtonProps {
  venueSlug: string
  eventId: string
  existingDistribution: PotDistributionSummary | null
}

export function GeneratePotPayrollButton({ venueSlug, eventId, existingDistribution }: GeneratePotPayrollButtonProps) {
  const router = useRouter()
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState("")

  if (existingDistribution) {
    return (
      <p className="text-sm text-muted-foreground">
        Generated <LocalTime date={existingDistribution.generatedAt} formatStr="datetimelong" /> —{" "}
        {existingDistribution.recipientCount} recipients, {existingDistribution.perPersonShare} gil each.
      </p>
    )
  }

  const generate = async () => {
    setIsGenerating(true)
    setError("")
    try {
      const res = await fetch(`/api/venues/${venueSlug}/events/${eventId}/pot-payroll`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Failed to generate pot payroll (${res.status})`)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate pot payroll")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={generate} disabled={isGenerating}>
        {isGenerating ? "Generating…" : "Generate Pot Payroll"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
