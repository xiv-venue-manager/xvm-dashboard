"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { EmojiPicker } from "@/components/emoji-picker"
import { RolePicker, useDiscordOptions } from "@/components/discord-picker"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { colorToHex, hexToColor } from "@/lib/audit-log-events"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import type { LevelingTierRow } from "@/lib/api/xvm-api"

export interface LevelingTiersProps {
  venueId: string
  tiers: LevelingTierRow[]
  onChange: (tiers: LevelingTierRow[]) => void
}

const byLevel = (a: LevelingTierRow, b: LevelingTierRow) => a.min_level - b.min_level || a.id - b.id

function TierForm({
  venueId,
  tier,
  onSaved,
  onClose,
}: {
  venueId: string
  tier: LevelingTierRow | null
  onSaved: (tier: LevelingTierRow) => void
  onClose?: () => void
}) {
  const [name, setName] = useState(tier?.name ?? "")
  const [minLevel, setMinLevel] = useState(String(tier?.min_level ?? 1))
  const [color, setColor] = useState(tier?.color == null ? "" : colorToHex(tier.color))
  const [icon, setIcon] = useState(tier?.icon ?? "")
  const [roleId, setRoleId] = useState(tier?.discord_role_id ?? "")
  const [saving, setSaving] = useState(false)

  async function save() {
    const level = Number(minLevel)
    if (name.trim() === "") {
      toast.error("Give the tier a name.")
      return
    }
    if (!Number.isInteger(level) || level < 0 || level > 2_147_483_647) {
      toast.error("The level must be a whole number, 0 or more.")
      return
    }
    if (roleId !== "" && !SNOWFLAKE_PATTERN.test(roleId)) {
      toast.error("Role ID must be numeric.")
      return
    }

    const body = {
      name: name.trim(),
      minLevel: level,
      color: color === "" ? null : hexToColor(color),
      icon: icon.trim() === "" ? null : icon.trim(),
      discordRoleId: roleId === "" ? null : roleId,
    }

    setSaving(true)
    try {
      const saved =
        tier === null
          ? await apiRoute<LevelingTierRow>("/api/venues/[venueId]/leveling/tiers", {
              params: { venueId },
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
          : await apiRoute<LevelingTierRow>("/api/venues/[venueId]/leveling/tiers/[tierId]", {
              params: { venueId, tierId: tier.id },
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
      onSaved(saved)
      toast.success(tier === null ? "Tier added." : "Tier saved.")
      if (tier === null) {
        setName("")
        setMinLevel("1")
        setColor("")
        setIcon("")
        setRoleId("")
      } else {
        onClose?.()
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save the tier.")
    } finally {
      setSaving(false)
    }
  }

  const key = tier?.id ?? "new"

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`tier-name-${key}`}>Name</Label>
          <Input id={`tier-name-${key}`} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`tier-level-${key}`}>From level</Label>
          <Input
            id={`tier-level-${key}`}
            type="number"
            min={0}
            value={minLevel}
            onChange={(e) => setMinLevel(e.target.value)}
            disabled={saving}
            className="w-28"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`tier-color-${key}`}>Colour</Label>
          <div className="flex items-center gap-2">
            <input
              id={`tier-color-${key}`}
              type="color"
              value={color || "#5865f2"}
              onChange={(e) => setColor(e.target.value)}
              disabled={saving}
              className="h-7 w-7 cursor-pointer appearance-none rounded-full border border-[var(--blue-018)] bg-transparent p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
            />
            {color !== "" && (
              <button type="button" onClick={() => setColor("")} className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]">
                No colour
              </button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Icon</Label>
          <EmojiPicker value={icon} onChange={setIcon} venueId={venueId} source="venue" maxLength={100} disabled={saving} />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Discord role</Label>
          {roleId !== "" && (
            <button type="button" onClick={() => setRoleId("")} className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]">
              No role
            </button>
          )}
        </div>
        <RolePicker venueId={venueId} value={roleId} onChange={setRoleId} disabled={saving} />
        <p className="text-xs text-muted-foreground">The bot gives this role to members who reach the tier.</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : tier === null ? "Add tier" : "Save tier"}
        </Button>
        {onClose && (
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

export function LevelingTiers({ venueId, tiers, onChange }: LevelingTiersProps) {
  const [editing, setEditing] = useState<number | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const roles = useDiscordOptions(venueId, "roles", tiers.some((tier) => tier.discord_role_id !== null))
  const roleName = (id: string) => roles.options.find((o) => o.value === id)?.label ?? id

  async function remove(tier: LevelingTierRow) {
    setRemoving(tier.id)
    try {
      await apiRoute("/api/venues/[venueId]/leveling/tiers/[tierId]", {
        params: { venueId, tierId: tier.id },
        method: "DELETE",
      })
      onChange(tiers.filter((t) => t.id !== tier.id))
      toast.success("Tier removed.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove the tier.")
    } finally {
      setRemoving(null)
    }
  }

  const sorted = [...tiers].sort(byLevel)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A tier is a named rank from a level up. A member holds the highest tier their level has reached.
      </p>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tiers yet.</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((tier) => (
            <Card key={tier.id}>
              <CardContent className="p-5">
                {editing === tier.id ? (
                  <TierForm
                    key={tier.id}
                    venueId={venueId}
                    tier={tier}
                    onSaved={(saved) => onChange(tiers.map((t) => (t.id === saved.id ? saved : t)))}
                    onClose={() => setEditing(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-[10rem] flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="tag"
                          style={tier.color === null ? undefined : { borderColor: colorToHex(tier.color), color: colorToHex(tier.color) }}
                        >
                          {tier.icon ? `${tier.icon} ` : ""}
                          {tier.name}
                        </Badge>
                        <span className="text-sm text-muted-foreground">from level {tier.min_level}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {tier.discord_role_id ? `Role: ${roleName(tier.discord_role_id)}` : "No Discord role"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline-blue" onClick={() => setEditing(tier.id)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => remove(tier)} disabled={removing === tier.id}>
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 p-5">
          <p className="font-semibold">New tier</p>
          <TierForm venueId={venueId} tier={null} onSaved={(saved) => onChange([...tiers, saved])} />
        </CardContent>
      </Card>
    </div>
  )
}
