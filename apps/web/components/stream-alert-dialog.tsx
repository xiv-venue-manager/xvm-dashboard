"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ChannelPicker, RolePicker } from "@/components/discord-picker"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import type { TrackedStreamRow } from "@/lib/api/xvm-api"

const TWITCH_USERNAME_PATTERN = /^[a-z0-9_]{4,25}$/

interface StreamAlertDialogProps {
  venueId: string
  stream: TrackedStreamRow | null
  onSaved: (stream: TrackedStreamRow, created: boolean) => void
  onClose: () => void
}

export function StreamAlertDialog({ venueId, stream, onSaved, onClose }: StreamAlertDialogProps) {
  const [username, setUsername] = useState(stream?.twitch_username ?? "")
  const [channelId, setChannelId] = useState(stream?.channel_id ?? "")
  const [roleId, setRoleId] = useState(stream?.role_id ?? "")
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    const login = username.trim().toLowerCase()
    if (!stream && !TWITCH_USERNAME_PATTERN.test(login)) {
      toast.error("A Twitch username is 4 to 25 letters, numbers or underscores.")
      return
    }
    if (channelId === "") {
      toast.error("Choose the channel the alert posts in.")
      return
    }

    setSubmitting(true)
    try {
      const headers = { "Content-Type": "application/json" }
      const saved = stream
        ? await apiRoute<TrackedStreamRow>("/api/venues/[venueId]/tracked-streams/[streamId]", {
            params: { venueId, streamId: stream.id },
            method: "PATCH",
            headers,
            body: JSON.stringify({ channelId, roleId: roleId || null }),
          })
        : await apiRoute<TrackedStreamRow>("/api/venues/[venueId]/tracked-streams", {
            params: { venueId },
            method: "POST",
            headers,
            body: JSON.stringify({ twitchUsername: login, channelId, ...(roleId && { roleId }) }),
          })
      toast.success(stream ? "Alert saved." : "Streamer added.")
      onSaved(saved, stream === null)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message.replace(/^Value error, /, "") : "Failed to save the alert.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{stream ? `Edit ${stream.twitch_username}` : "Add a streamer"}</DialogTitle>
          <DialogDescription>
            The bot posts in the channel when this Twitch streamer goes live, and pings the role if you pick one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="stream-username">Twitch username</Label>
            <Input
              id="stream-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={25}
              placeholder="somestreamer"
              disabled={submitting || stream !== null}
            />
            {stream && <p className="text-xs text-muted-foreground">To track a different streamer, remove this one and add them.</p>}
          </div>

          <div className="space-y-2">
            <Label>Alert channel</Label>
            <ChannelPicker venueId={venueId} value={channelId} onChange={setChannelId} disabled={submitting} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Role to ping</Label>
              {roleId !== "" && (
                <button
                  type="button"
                  onClick={() => setRoleId("")}
                  className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]"
                >
                  No ping
                </button>
              )}
            </div>
            <RolePicker venueId={venueId} value={roleId} onChange={setRoleId} disabled={submitting} grants={false} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
