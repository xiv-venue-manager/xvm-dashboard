"use client"

import { useEffect, useState } from "react"
import { CalendarCheck } from "lucide-react"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ApiError, apiRoute } from "@/lib/api-fetch"

interface ShiftApprovalRow {
  autoApprove: boolean
}

export function ShiftApprovalSettings({ venueSlug }: { venueSlug: string }) {
  const [autoApprove, setAutoApprove] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    apiRoute<ShiftApprovalRow>("/api/venues/[venueId]/shift-settings", {
      params: { venueId: venueSlug },
    })
      .then((row) => {
        setAutoApprove(row.autoApprove)
        setLoadFailed(false)
      })
      .catch(() => setLoadFailed(true))
  }, [venueSlug, attempt])

  async function write(enabled: boolean) {
    const previous = autoApprove
    setAutoApprove(enabled)
    setSaving(true)
    try {
      const row = await apiRoute<ShiftApprovalRow>("/api/venues/[venueId]/shift-settings", {
        params: { venueId: venueSlug },
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      setAutoApprove(row.autoApprove)
      toast.success(
        enabled
          ? "Shift claims will be auto-approved. Claims already waiting were approved."
          : "Shift claims now need manager approval."
      )
    } catch (err) {
      setAutoApprove(previous)
      toast.error(err instanceof ApiError ? err.message : "Couldn't update shift approval.")
    } finally {
      setSaving(false)
    }
  }

  if (loadFailed) {
    return (
      <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
        <p className="pl-[54px] text-xs text-[var(--fg-faint)]">
          Couldn&apos;t load shift approval settings.{" "}
          <button
            type="button"
            onClick={() => {
              setLoadFailed(false)
              setAttempt((n) => n + 1)
            }}
            className="text-[var(--xiv-blue)] hover:underline"
          >
            Try again
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
      <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
        <CalendarCheck />
      </span>
      <div className="iinfo min-w-0 flex-1">
        <div className="iname">Auto-approve shift claims</div>
        <div className="idesc">
          New claims take their seat immediately. Turning this on also approves claims already waiting.
        </div>
      </div>
      <Label className="ml-auto shrink-0 cursor-pointer font-normal">
        <Switch
          checked={autoApprove ?? false}
          onCheckedChange={(checked) => void write(checked)}
          disabled={autoApprove === null || saving}
        />
        <span className="text-sm">{saving ? "Saving..." : autoApprove ? "Enabled" : "Disabled"}</span>
      </Label>
    </div>
  )
}
