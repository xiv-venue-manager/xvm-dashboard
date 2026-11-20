"use client"

import { useEffect, useState, type ReactNode } from "react"
import { CalendarCheck, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ApiError, apiRoute } from "@/lib/api-fetch"

interface ShiftClaimRow {
  autoApprove: boolean
  qualificationRequired: boolean
}

type ShiftClaimPatch = { enabled: boolean } | { qualificationRequired: boolean }

function SwitchRow({
  icon,
  name,
  description,
  checked,
  disabled,
  saving,
  onChange,
}: {
  icon: ReactNode
  name: string
  description: string
  checked: boolean
  disabled: boolean
  saving: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
      <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
        {icon}
      </span>
      <div className="iinfo min-w-0 flex-1">
        <div className="iname">{name}</div>
        <div className="idesc">{description}</div>
      </div>
      <Label className="ml-auto shrink-0 cursor-pointer font-normal">
        <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
        <span className="text-sm">{saving ? "Saving..." : checked ? "Enabled" : "Disabled"}</span>
      </Label>
    </div>
  )
}

export function ShiftClaimSettings({ venueSlug }: { venueSlug: string }) {
  const [row, setRow] = useState<ShiftClaimRow | null>(null)
  const [saving, setSaving] = useState<keyof ShiftClaimRow | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    apiRoute<ShiftClaimRow>("/api/venues/[venueId]/shift-settings", {
      params: { venueId: venueSlug },
    })
      .then((next) => {
        setRow(next)
        setLoadFailed(false)
      })
      .catch(() => setLoadFailed(true))
  }, [venueSlug, attempt])

  async function write(field: keyof ShiftClaimRow, patch: ShiftClaimPatch, enabled: boolean, message: string) {
    const previous = row
    setRow((current) => current && { ...current, [field]: enabled })
    setSaving(field)
    try {
      const next = await apiRoute<ShiftClaimRow>("/api/venues/[venueId]/shift-settings", {
        params: { venueId: venueSlug },
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      setRow(next)
      toast.success(message)
    } catch (err) {
      setRow(previous)
      toast.error(err instanceof ApiError ? err.message : "Couldn't update shift settings.")
    } finally {
      setSaving(null)
    }
  }

  if (loadFailed) {
    return (
      <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
        <p className="pl-[54px] text-xs text-[var(--fg-faint)]">
          Couldn&apos;t load shift settings.{" "}
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
    <>
      <SwitchRow
        icon={<CalendarCheck />}
        name="Auto-approve shift claims"
        description="New claims take their seat immediately. Turning this on also approves claims already waiting."
        checked={row?.autoApprove ?? false}
        disabled={row === null || saving !== null}
        saving={saving === "autoApprove"}
        onChange={(enabled) =>
          void write(
            "autoApprove",
            { enabled },
            enabled,
            enabled
              ? "Shift claims will be auto-approved. Claims already waiting were approved."
              : "Shift claims now need manager approval."
          )
        }
      />
      <SwitchRow
        icon={<ShieldCheck />}
        name="Require the position to claim a shift"
        description="Staff can only claim event shifts for positions they hold. Managers can still assign anyone."
        checked={row?.qualificationRequired ?? false}
        disabled={row === null || saving !== null}
        saving={saving === "qualificationRequired"}
        onChange={(enabled) =>
          void write(
            "qualificationRequired",
            { qualificationRequired: enabled },
            enabled,
            enabled
              ? "Staff can now only claim shifts for positions they hold."
              : "Staff can claim shifts for any position."
          )
        }
      />
    </>
  )
}
