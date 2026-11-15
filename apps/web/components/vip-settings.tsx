"use client"

import { useState } from "react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChannelPicker, useDiscordOptions } from "@/components/discord-picker"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { VIP_POST_KINDS, VIP_POST_LABELS } from "@/lib/vips"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import { useMounted } from "@/lib/use-mounted"
import type { VipPostKind, VipPostRow, VipSettings } from "@/lib/api/xvm-api"

export interface VipSettingsProps {
  venueId: string
  settings: VipSettings
  posts: VipPostRow[]
}

export function VipSettingsPanel({ venueId, settings, posts: initialPosts }: VipSettingsProps) {
  const [days, setDays] = useState(settings.warning_days == null ? "" : String(settings.warning_days))
  const [saving, setSaving] = useState(false)
  const [posts, setPosts] = useState(initialPosts)
  const [kind, setKind] = useState<VipPostKind>("roster")
  const [channel, setChannel] = useState("")
  const [posting, setPosting] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const channels = useDiscordOptions(venueId, "channels", posts.length > 0)
  const channelName = (id: string) => channels.options.find((o) => o.value === id)?.label ?? id
  const mounted = useMounted()

  async function saveDays() {
    const parsed = days.trim() === "" ? null : Number(days)
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 10)) {
      toast.error("Warn between 1 and 10 days before expiry, or leave it empty for no warning.")
      return
    }
    setSaving(true)
    try {
      await apiRoute("/api/venues/[venueId]/vips/settings", {
        params: { venueId },
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warningDays: parsed }),
      })
      toast.success("Settings saved.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save the settings.")
    } finally {
      setSaving(false)
    }
  }

  async function post() {
    if (!SNOWFLAKE_PATTERN.test(channel)) {
      toast.error("Choose a channel to post in.")
      return
    }
    setPosting(true)
    try {
      await apiRoute("/api/venues/[venueId]/vips/posts", {
        params: { venueId },
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, channelId: channel }),
      })
      toast.success("Posting. The bot puts it in the channel and keeps it up to date.")
      setPosts(await apiRoute<VipPostRow[]>("/api/venues/[venueId]/vips/posts", { params: { venueId } }))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to post.")
    } finally {
      setPosting(false)
    }
  }

  async function takeDown(row: VipPostRow) {
    const key = `${row.kind}-${row.channel_id}`
    setRemoving(key)
    try {
      await apiRoute("/api/venues/[venueId]/vips/posts/[kind]/[channelId]", {
        params: { venueId, kind: row.kind, channelId: row.channel_id },
        method: "DELETE",
      })
      setPosts((prev) => prev.filter((p) => !(p.kind === row.kind && p.channel_id === row.channel_id)))
      toast.success("Taken down.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to take it down.")
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <p className="font-semibold">Expiry warning</p>
          <div className="space-y-2">
            <Label htmlFor="vip-warning-days">Days before expiry to warn a VIP</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Input id="vip-warning-days" type="number" min={1} max={10} value={days} onChange={(e) => setDays(e.target.value)} disabled={saving} className="w-28" />
              <Button onClick={saveDays} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">1 to 10 days. Leave it empty and VIPs are not warned.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="font-semibold">Posts</p>
            <p className="text-sm text-muted-foreground">The bot posts the roster or the perks catalogue to a channel and keeps it up to date.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={kind} onValueChange={(v) => setKind(v as VipPostKind)} disabled={posting}>
              <SelectTrigger aria-label="What to post" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIP_POST_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {VIP_POST_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ChannelPicker venueId={venueId} value={channel} onChange={setChannel} disabled={posting} />
            <Button onClick={post} disabled={posting}>
              {posting ? "Posting..." : "Post"}
            </Button>
          </div>
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is posted.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {posts.map((row) => (
                <li key={`${row.kind}-${row.channel_id}`} className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    {VIP_POST_LABELS[row.kind]} in {channelName(row.channel_id)}
                    <span className="text-muted-foreground">
                      {row.posted_at ? (mounted ? `, ${format(new Date(row.posted_at), "PPp")}` : "") : ", waiting for the bot"}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" disabled={removing === `${row.kind}-${row.channel_id}`} onClick={() => takeDown(row)}>
                    Take down
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
