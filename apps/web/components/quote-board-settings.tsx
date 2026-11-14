"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { ChannelPicker, useDiscordOptions } from "@/components/discord-picker"
import { EmojiPicker } from "@/components/emoji-picker"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import type { QuoteBoardSettingsRow } from "@/lib/api/xvm-api"

export interface QuoteBoardSettingsProps {
  venueId: string
  canManage: boolean
  settings: QuoteBoardSettingsRow
}

export function QuoteBoardSettings({ venueId, canManage, settings }: QuoteBoardSettingsProps) {
  const [boardChannelId, setBoardChannelId] = useState(settings.board_channel_id ?? "")
  const [emoji, setEmoji] = useState(settings.emoji)
  const [threshold, setThreshold] = useState(String(settings.reaction_threshold))
  const [allowNsfw, setAllowNsfw] = useState(settings.allow_nsfw_sources)
  const [ignored, setIgnored] = useState(settings.blacklisted_channel_ids)
  const [pendingIgnore, setPendingIgnore] = useState("")
  const [saving, setSaving] = useState(false)

  const channels = useDiscordOptions(venueId, "channels", canManage && ignored.length > 0)
  const channelName = (id: string) => channels.options.find((o) => o.value === id)?.label ?? id

  const canAddIgnore = SNOWFLAKE_PATTERN.test(pendingIgnore) && !ignored.includes(pendingIgnore)

  function addIgnored() {
    if (!canAddIgnore) return
    setIgnored((prev) => [...prev, pendingIgnore])
    setPendingIgnore("")
  }

  async function save() {
    const count = Number(threshold)
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      toast.error("The reaction count must be a whole number from 1 to 100.")
      return
    }
    if (emoji.trim() === "") {
      toast.error("Choose the reaction emoji.")
      return
    }
    if (boardChannelId !== "" && !SNOWFLAKE_PATTERN.test(boardChannelId)) {
      toast.error("Channel ID must be numeric.")
      return
    }

    setSaving(true)
    try {
      await apiRoute("/api/venues/[venueId]/quote-board/settings", {
        params: { venueId },
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardChannelId: boardChannelId === "" ? null : boardChannelId,
          emoji: emoji.trim(),
          reactionThreshold: count,
          allowNsfwSources: allowNsfw,
          blacklistedChannelIds: ignored,
        }),
      })
      toast.success("Quote board saved.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message.replace(/^Value error, /, "") : "Failed to save the quote board.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div>
          <p className="font-semibold">Settings</p>
          <p className="text-sm text-muted-foreground">
            When a message gets enough of the reaction, the bot copies it to the board channel. With no board channel the
            board is off.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Board channel</Label>
            {canManage && boardChannelId !== "" && (
              <button
                type="button"
                onClick={() => setBoardChannelId("")}
                className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]"
              >
                Turn the board off
              </button>
            )}
          </div>
          <ChannelPicker venueId={venueId} value={boardChannelId} onChange={setBoardChannelId} disabled={!canManage || saving} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Reaction</Label>
            <EmojiPicker value={emoji} onChange={setEmoji} venueId={venueId} source="venue" maxLength={100} disabled={!canManage || saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-threshold">Reactions needed</Label>
            <Input
              id="quote-threshold"
              type="number"
              min={1}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              disabled={!canManage || saving}
              className="w-28"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Quote from NSFW channels</p>
            <p className="text-xs text-muted-foreground">Off by default. Messages in age-restricted channels are skipped.</p>
          </div>
          <Switch
            checked={allowNsfw}
            onCheckedChange={setAllowNsfw}
            disabled={!canManage || saving}
            aria-label="Quote messages from NSFW channels"
          />
        </div>

        <div className="space-y-2">
          <Label>Channels to ignore</Label>
          {ignored.length === 0 ? (
            <p className="text-sm text-muted-foreground">No channels are ignored.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ignored.map((id) => (
                <Badge key={id} variant="tag" className="gap-1.5">
                  {channelName(id)}
                  {canManage && (
                    <button
                      type="button"
                      aria-label={`Stop ignoring ${channelName(id)}`}
                      onClick={() => setIgnored((prev) => prev.filter((c) => c !== id))}
                      disabled={saving}
                      className="hover:text-[var(--xiv-blue)]"
                    >
                      &times;
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <ChannelPicker venueId={venueId} value={pendingIgnore} onChange={setPendingIgnore} disabled={saving} />
              <Button size="sm" variant="outline" onClick={addIgnored} disabled={!canAddIgnore || saving}>
                Ignore channel
              </Button>
            </div>
          )}
        </div>

        {canManage && (
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
