"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
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
import { useDiscordOptions } from "@/components/discord-picker"
import { StickyEditor } from "@/components/sticky-editor"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import type { StickyRow } from "@/lib/api/xvm-api"

export interface StickiesBoardProps {
  venueId: string
  canManage: boolean
  stickies: StickyRow[]
}

export function StickiesBoard({ venueId, canManage, stickies: initialStickies }: StickiesBoardProps) {
  const [stickies, setStickies] = useState(initialStickies)
  const [editing, setEditing] = useState<StickyRow | "new" | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StickyRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState<number[]>([])
  const channels = useDiscordOptions(venueId, "channels")
  const channelName = (id: string) => channels.options.find((o) => o.value === id)?.label

  function handleSaved(saved: StickyRow, created: boolean) {
    setStickies((prev) => (created ? [...prev, saved] : prev.map((s) => (s.id === saved.id ? saved : s))))
    setEditing(saved)
  }

  async function toggle(sticky: StickyRow, enabled: boolean) {
    const replace = (value: boolean) => setStickies((prev) => prev.map((s) => (s.id === sticky.id ? { ...s, enabled: value } : s)))
    replace(enabled)
    setToggling((prev) => [...prev, sticky.id])
    try {
      await apiRoute("/api/venues/[venueId]/sticky-messages/[stickyId]", {
        params: { venueId, stickyId: sticky.id },
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
    } catch (e) {
      replace(!enabled)
      toast.error(e instanceof ApiError ? e.message : "Failed to update the sticky.")
    } finally {
      setToggling((prev) => prev.filter((id) => id !== sticky.id))
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiRoute("/api/venues/[venueId]/sticky-messages/[stickyId]", {
        params: { venueId, stickyId: deleteTarget.id },
        method: "DELETE",
      })
      setStickies((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      toast.success("Sticky deleted. The bot takes its message down.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to delete the sticky.")
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (editing !== null) {
    return (
      <StickyEditor
        key={editing === "new" ? "new" : editing.id}
        venueId={venueId}
        sticky={editing === "new" ? null : editing}
        canManage={canManage}
        onSaved={handleSaved}
        onClose={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{stickies.length} sticky messages.</p>
        {canManage && <Button size="sm" onClick={() => setEditing("new")}>New sticky</Button>}
      </div>

      {stickies.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sticky messages yet.</p>
      ) : (
        <div className="space-y-3">
          {stickies.map((sticky) => (
            <Card key={sticky.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-[10rem] flex-1">
                  <p className="font-semibold">{sticky.title ?? "(no title)"}</p>
                  <p className="text-sm text-muted-foreground">
                    {channelName(sticky.channel_id) ?? <code>{sticky.channel_id}</code>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Switch
                    checked={sticky.enabled}
                    onCheckedChange={(v) => toggle(sticky, v)}
                    disabled={!canManage || toggling.includes(sticky.id)}
                    aria-label={`${sticky.title ?? "Sticky"} enabled`}
                  />
                  <Button size="sm" variant="outline-blue" onClick={() => setEditing(sticky)}>
                    {canManage ? "Edit" : "View"}
                  </Button>
                  {canManage && (
                    <Button size="sm" variant="outline" onClick={() => setDeleteTarget(sticky)}>
                      Delete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.title ?? "this sticky"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The bot takes the message down from the channel, and its uploaded images are deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
