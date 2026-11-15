"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { ChannelPicker, RolePicker, useDiscordOptions } from "@/components/discord-picker"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { xpForLevel } from "@/lib/leveling"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import type { LevelingSettings as LevelingSettingsRow } from "@/lib/api/xvm-api"

export interface LevelingSettingsProps {
  venueId: string
  settings: LevelingSettingsRow
  onSaved: (settings: LevelingSettingsRow) => void
}

function IdList({
  label,
  empty,
  ids,
  nameOf,
  onRemove,
  disabled,
}: {
  label: string
  empty: string
  ids: string[]
  nameOf: (id: string) => string
  onRemove: (id: string) => void
  disabled: boolean
}) {
  if (ids.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <Badge key={id} variant="tag" className="gap-1.5">
          {nameOf(id)}
          <button
            type="button"
            aria-label={`Stop excluding ${label} ${nameOf(id)}`}
            onClick={() => onRemove(id)}
            disabled={disabled}
            className="hover:text-[var(--xiv-blue)]"
          >
            &times;
          </button>
        </Badge>
      ))}
    </div>
  )
}

export function LevelingSettings({ venueId, settings, onSaved }: LevelingSettingsProps) {
  const [xpName, setXpName] = useState(settings.xp_name)
  const [quadratic, setQuadratic] = useState(String(settings.curve_quadratic))
  const [linear, setLinear] = useState(String(settings.curve_linear))
  const [announceId, setAnnounceId] = useState(settings.announcement_channel_id ?? "")
  const [voiceNeedsCompany, setVoiceNeedsCompany] = useState(settings.voice_needs_company)
  const [excludedChannels, setExcludedChannels] = useState(settings.excluded_channel_ids)
  const [excludedRoles, setExcludedRoles] = useState(settings.excluded_role_ids)
  const [pendingChannel, setPendingChannel] = useState("")
  const [pendingRole, setPendingRole] = useState("")
  const [saving, setSaving] = useState(false)

  const channels = useDiscordOptions(venueId, "channels", excludedChannels.length > 0)
  const roles = useDiscordOptions(venueId, "roles", excludedRoles.length > 0)
  const channelName = (id: string) => channels.options.find((o) => o.value === id)?.label ?? id
  const roleName = (id: string) => roles.options.find((o) => o.value === id)?.label ?? id

  const quadraticNumber = Number(quadratic)
  const linearNumber = Number(linear)
  const curveOk =
    Number.isInteger(quadraticNumber) &&
    quadraticNumber >= 1 &&
    quadraticNumber <= 10000 &&
    Number.isInteger(linearNumber) &&
    linearNumber >= 0 &&
    linearNumber <= 10000
  const name = xpName.trim() === "" ? "XP" : xpName.trim()

  const canAddChannel = SNOWFLAKE_PATTERN.test(pendingChannel) && !excludedChannels.includes(pendingChannel)
  const canAddRole = SNOWFLAKE_PATTERN.test(pendingRole) && !excludedRoles.includes(pendingRole)

  async function save() {
    if (xpName.trim() === "" || xpName.trim().length > 32) {
      toast.error("The XP name must be 1 to 32 characters.")
      return
    }
    if (!curveOk) {
      toast.error("The curve numbers must be whole numbers: the squared part from 1 to 10000, the plain part from 0 to 10000.")
      return
    }
    if (announceId !== "" && !SNOWFLAKE_PATTERN.test(announceId)) {
      toast.error("Channel ID must be numeric.")
      return
    }

    setSaving(true)
    try {
      const saved = await apiRoute<LevelingSettingsRow>("/api/venues/[venueId]/leveling/settings", {
        params: { venueId },
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xpName: xpName.trim(),
          curveQuadratic: quadraticNumber,
          curveLinear: linearNumber,
          announcementChannelId: announceId === "" ? null : announceId,
          excludedChannelIds: excludedChannels,
          excludedRoleIds: excludedRoles,
          voiceNeedsCompany,
        }),
      })
      onSaved(saved)
      toast.success("Leveling settings saved.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message.replace(/^Value error, /, "") : "Failed to save the leveling settings.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div>
          <p className="font-semibold">Settings</p>
          <p className="text-sm text-muted-foreground">How members level up and where the bot announces it.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="leveling-xp-name">What the points are called</Label>
          <Input
            id="leveling-xp-name"
            value={xpName}
            maxLength={32}
            onChange={(e) => setXpName(e.target.value)}
            disabled={saving}
            className="w-48"
          />
        </div>

        <div className="space-y-2">
          <Label>Level curve</Label>
          <p className="text-xs text-muted-foreground">
            Total {name} for level L is the squared number times L&sup2; plus the plain number times L.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="Squared number"
              type="number"
              min={1}
              max={10000}
              value={quadratic}
              onChange={(e) => setQuadratic(e.target.value)}
              disabled={saving}
              className="w-28"
            />
            <span className="text-sm text-muted-foreground">&times; L&sup2; +</span>
            <Input
              aria-label="Plain number"
              type="number"
              min={0}
              max={10000}
              value={linear}
              onChange={(e) => setLinear(e.target.value)}
              disabled={saving}
              className="w-28"
            />
            <span className="text-sm text-muted-foreground">&times; L</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {curveOk
              ? [1, 5, 10, 25]
                  .map((level) => `Level ${level}: ${xpForLevel(level, { curve_quadratic: quadraticNumber, curve_linear: linearNumber }).toLocaleString()} ${name}`)
                  .join(" · ")
              : "Enter whole numbers to preview the curve."}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Level-up announcements</Label>
            {announceId !== "" && (
              <button
                type="button"
                onClick={() => setAnnounceId("")}
                className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]"
              >
                Turn announcements off
              </button>
            )}
          </div>
          <ChannelPicker venueId={venueId} value={announceId} onChange={setAnnounceId} disabled={saving} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Voice {name} needs company</p>
            <p className="text-xs text-muted-foreground">When on, sitting alone in a voice channel earns nothing.</p>
          </div>
          <Switch
            checked={voiceNeedsCompany}
            onCheckedChange={setVoiceNeedsCompany}
            disabled={saving}
            aria-label="Voice XP needs someone else in the channel"
          />
        </div>

        <div className="space-y-2">
          <Label>Channels that earn nothing</Label>
          <IdList
            label="channel"
            empty="No channels are excluded."
            ids={excludedChannels}
            nameOf={channelName}
            onRemove={(id) => setExcludedChannels((prev) => prev.filter((c) => c !== id))}
            disabled={saving}
          />
          <div className="flex flex-wrap items-center gap-2">
            <ChannelPicker venueId={venueId} value={pendingChannel} onChange={setPendingChannel} disabled={saving} />
            <Button
              size="sm"
              variant="outline"
              disabled={!canAddChannel || saving}
              onClick={() => {
                setExcludedChannels((prev) => [...prev, pendingChannel])
                setPendingChannel("")
              }}
            >
              Exclude channel
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Roles that earn nothing</Label>
          <IdList
            label="role"
            empty="No roles are excluded."
            ids={excludedRoles}
            nameOf={roleName}
            onRemove={(id) => setExcludedRoles((prev) => prev.filter((r) => r !== id))}
            disabled={saving}
          />
          <div className="flex flex-wrap items-center gap-2">
            <RolePicker venueId={venueId} value={pendingRole} onChange={setPendingRole} disabled={saving} grants={false} />
            <Button
              size="sm"
              variant="outline"
              disabled={!canAddRole || saving}
              onClick={() => {
                setExcludedRoles((prev) => [...prev, pendingRole])
                setPendingRole("")
              }}
            >
              Exclude role
            </Button>
          </div>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </CardContent>
    </Card>
  )
}
