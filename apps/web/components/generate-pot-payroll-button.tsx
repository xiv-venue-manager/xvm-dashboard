"use client"

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

export function GeneratePotPayrollButton({ existingDistribution }: GeneratePotPayrollButtonProps) {
  if (existingDistribution) {
    return (
      <p className="text-sm text-muted-foreground">
        Generated <LocalTime date={existingDistribution.generatedAt} formatStr="datetimelong" /> —{" "}
        {existingDistribution.recipientCount} recipients, {existingDistribution.perPersonShare} gil each.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <Button disabled title="Unavailable until the Events cutover lands">
        Generate Pot Payroll
      </Button>
      <p className="text-sm text-muted-foreground">
        Generation is unavailable until Events moves to xvm-api and pot revenue can be computed there.
      </p>
    </div>
  )
}
