"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { StreamAlertDialog } from "@/components/stream-alert-dialog"
import { useDiscordOptions } from "@/components/discord-picker"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import type { TrackedStreamRow } from "@/lib/api/xvm-api"

const MAX_STREAMS = 25

export interface StreamAlertsBoardProps {
  venueId: string
  canManage: boolean
  streams: TrackedStreamRow[]
}

export function StreamAlertsBoard({ venueId, canManage, streams: initialStreams }: StreamAlertsBoardProps) {
  const [streams, setStreams] = useState(initialStreams)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<TrackedStreamRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TrackedStreamRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const channels = useDiscordOptions(venueId, "channels", canManage && streams.length > 0)
  const roles = useDiscordOptions(venueId, "roles", canManage && streams.some((s) => s.role_id !== null))
  const channelName = (id: string) => channels.options.find((o) => o.value === id)?.label ?? id
  const roleName = (id: string) => `@${roles.options.find((o) => o.value === id)?.label ?? id}`

  function handleSaved(stream: TrackedStreamRow, created: boolean) {
    setStreams((prev) => (created ? [...prev, stream] : prev.map((s) => (s.id === stream.id ? stream : s))))
    setAdding(false)
    setEditing(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiRoute("/api/venues/[venueId]/tracked-streams/[streamId]", {
        params: { venueId, streamId: deleteTarget.id },
        method: "DELETE",
      })
      setStreams((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      toast.success("Streamer removed.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove the streamer.")
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {streams.length} of {MAX_STREAMS} streamers tracked.
          </p>
          {canManage && (
            <Button size="sm" onClick={() => setAdding(true)} disabled={streams.length >= MAX_STREAMS}>
              Add streamer
            </Button>
          )}
        </div>

        {streams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No streamers tracked yet.</p>
        ) : (
          <div className="space-y-3">
            {streams.map((stream) => (
              <Card key={stream.id}>
                <CardContent className="flex flex-wrap items-center gap-4 p-5 sm:flex-nowrap">
                  <div className="min-w-[10rem] flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`https://twitch.tv/${stream.twitch_username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold hover:text-[var(--xiv-blue)]"
                      >
                        {stream.twitch_username}
                      </a>
                      {stream.is_live && <Badge variant="tag">Live now</Badge>}
                      {stream.resolution_failed_at !== null && (
                        <Badge variant="status-soon">Twitch has no account with this name</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="tag">Posts in {channelName(stream.channel_id)}</Badge>
                      {stream.role_id !== null && <Badge variant="tag">Pings {roleName(stream.role_id)}</Badge>}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline-blue" onClick={() => setEditing(stream)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(stream)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        The bot needs View Channel and Send Messages in each alert channel, and Mention Everyone if a role to ping is not
        set to be mentionable.
      </p>

      {(adding || editing) && (
        <StreamAlertDialog
          key={editing?.id ?? "new"}
          venueId={venueId}
          stream={editing}
          onSaved={handleSaved}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop tracking {deleteTarget?.twitch_username}?</AlertDialogTitle>
            <AlertDialogDescription>
              The bot stops posting when they go live. Alerts not yet sent are dropped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
