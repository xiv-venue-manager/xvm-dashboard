"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { ChannelPicker } from "@/components/discord-picker"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import {
  AUDIT_LOG_EVENT_GROUPS,
  AUDIT_LOG_EVENT_LABELS,
  colorToHex,
  hexToColor,
  type AuditLogEventKey,
} from "@/lib/audit-log-events"
import type { AuditLogEventRow, AuditLogSettingsRow } from "@/lib/api/xvm-api"

export interface AuditLogBoardProps {
  venueId: string
  canManage: boolean
  settings: AuditLogSettingsRow
  events: AuditLogEventRow[]
}

export function AuditLogBoard({ venueId, canManage, settings, events: initialEvents }: AuditLogBoardProps) {
  const [channelId, setChannelId] = useState(settings.channel_id ?? "")
  const [savedChannelId, setSavedChannelId] = useState(settings.channel_id ?? "")
  const [savingChannel, setSavingChannel] = useState(false)
  const [events, setEvents] = useState<Record<string, AuditLogEventRow>>(
    Object.fromEntries(initialEvents.map((e) => [e.event_key, e]))
  )
  const [pending, setPending] = useState<string | null>(null)
  const [draftColors, setDraftColors] = useState<Record<string, string>>({})

  async function saveChannel(next: string) {
    setChannelId(next)
    setSavingChannel(true)
    try {
      await apiRoute("/api/venues/[venueId]/audit-log/settings", {
        params: { venueId },
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: next === "" ? null : next }),
      })
      setSavedChannelId(next)
      toast.success(next === "" ? "Mirroring stopped." : "Log channel saved.")
    } catch (e) {
      setChannelId(savedChannelId)
      toast.error(e instanceof ApiError ? e.message : "Failed to save the log channel.")
    } finally {
      setSavingChannel(false)
    }
  }

  async function turnOn(key: AuditLogEventKey, color: number | null) {
    setPending(key)
    try {
      const row = await apiRoute<AuditLogEventRow>("/api/venues/[venueId]/audit-log/events/[eventKey]", {
        params: { venueId, eventKey: key },
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      })
      setEvents((prev) => ({ ...prev, [key]: row }))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save the event.")
    } finally {
      setPending(null)
    }
  }

  async function turnOff(key: AuditLogEventKey) {
    setPending(key)
    try {
      await apiRoute("/api/venues/[venueId]/audit-log/events/[eventKey]", {
        params: { venueId, eventKey: key },
        method: "DELETE",
      })
      setEvents((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to stop the event.")
    } finally {
      setPending(null)
    }
  }

  function finishColor(key: AuditLogEventKey, row: AuditLogEventRow, hex: string) {
    setDraftColors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    const chosen = hexToColor(hex)
    if (chosen !== hexToColor(colorToHex(row.color))) turnOn(key, chosen)
  }

  const mirrored = Object.keys(events).length

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="font-semibold">Log channel</p>
            <p className="text-sm text-muted-foreground">
              The bot posts each event you turn on below into this channel.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ChannelPicker
              venueId={venueId}
              value={channelId}
              onChange={(value) => {
                setChannelId(value)
                if (value === "" || SNOWFLAKE_PATTERN.test(value)) void saveChannel(value)
              }}
              disabled={!canManage || savingChannel}
            />
            {canManage && channelId !== "" && (
              <Button size="sm" variant="outline" onClick={() => saveChannel("")} disabled={savingChannel}>
                Stop mirroring
              </Button>
            )}
          </div>
          {channelId === "" && mirrored > 0 && (
            <p className="text-sm text-muted-foreground">
              No channel is set, so nothing is posted. Your event choices below are kept.
            </p>
          )}
        </CardContent>
      </Card>

      {AUDIT_LOG_EVENT_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-2 text-sm font-semibold">{group.label}</p>
          <div className="space-y-2">
            {group.keys.map((key) => {
              const row = events[key]
              const on = row !== undefined
              return (
                <Card key={key}>
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <span className="text-sm">{AUDIT_LOG_EVENT_LABELS[key]}</span>
                    <div className="flex items-center gap-3">
                      {on && (
                        <input
                          type="color"
                          aria-label={`Embed colour for ${AUDIT_LOG_EVENT_LABELS[key]}`}
                          value={draftColors[key] ?? colorToHex(row.color)}
                          disabled={!canManage || pending === key}
                          onChange={(e) => setDraftColors((prev) => ({ ...prev, [key]: e.target.value }))}
                          onBlur={(e) => finishColor(key, row, e.target.value)}
                          className="h-7 w-7 cursor-pointer appearance-none rounded-full border border-[var(--blue-018)] bg-transparent p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
                        />
                      )}
                      <Switch
                        checked={on}
                        onCheckedChange={(next) => (next ? turnOn(key, null) : turnOff(key))}
                        disabled={!canManage || pending === key}
                        aria-label={`Mirror: ${AUDIT_LOG_EVENT_LABELS[key]}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        The bot needs View Channel and Send Messages in the log channel. Discord&apos;s own audit log has no message
        edits, joins or voice activity, which is why these are mirrored separately.
      </p>
    </div>
  )
}
