"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
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
import { ReactionRolePanelFormDialog } from "@/components/reaction-role-panel-form-dialog"
import { ApplyTemplateDialog } from "@/components/apply-template-dialog"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import type { PanelRow, PanelPostRow, TemplateRow } from "@/lib/api/xvm-api"

export interface ReactionRolePanelsBoardProps {
  venueId: string
  canManage: boolean
  panels: PanelRow[]
  templates: TemplateRow[]
  notConnected?: boolean
}

const NOT_CONNECTED_MESSAGE = "Ask the venue owner to connect this venue to xvm-api first."
const SNOWFLAKE_PATTERN = /^\d+$/
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 15000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function ReactionRolePanelsBoard({
  venueId,
  canManage,
  panels: initialPanels,
  templates,
  notConnected,
}: ReactionRolePanelsBoardProps) {
  const [panels, setPanels] = useState<PanelRow[]>(initialPanels)
  const [deleteTarget, setDeleteTarget] = useState<PanelRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [postTarget, setPostTarget] = useState<PanelRow | null>(null)
  const [postChannelId, setPostChannelId] = useState("")
  const [posting, setPosting] = useState(false)
  const [postsByPanel, setPostsByPanel] = useState<Record<number, PanelPostRow[]>>({})

  useEffect(() => {
    let cancelled = false
    Promise.all(
      panels.map((p) =>
        apiFetch<PanelPostRow[]>(`/api/venues/${venueId}/reaction-role-panels/${p.id}/posts`)
          .then((posts) => [p.id, posts] as const)
          .catch(() => [p.id, []] as const)
      )
    ).then((results) => {
      if (cancelled) return
      setPostsByPanel(Object.fromEntries(results))
    })
    return () => {
      cancelled = true
    }
  }, [venueId, panels])

  function handleCreated(panel: PanelRow) {
    setPanels((prev) => [panel, ...prev])
  }

  function handleUpdated(panel: PanelRow) {
    setPanels((prev) => prev.map((p) => (p.id === panel.id ? panel : p)))
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch(`/api/venues/${venueId}/reaction-role-panels/${deleteTarget.id}`, { method: "DELETE" })
      setPanels((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      toast.success("Panel deleted.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to delete panel.")
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  async function confirmPost() {
    if (!postTarget) return
    if (!SNOWFLAKE_PATTERN.test(postChannelId)) {
      toast.error("Channel ID must be numeric.")
      return
    }
    setPosting(true)
    const toastId = toast.loading("Asking the bot...")
    try {
      await apiFetch(`/api/venues/${venueId}/reaction-role-panels/${postTarget.id}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: postChannelId }),
      })

      const deadline = Date.now() + POLL_TIMEOUT_MS
      let found = false
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS)
        const posts = await apiFetch<PanelPostRow[]>(
          `/api/venues/${venueId}/reaction-role-panels/${postTarget.id}/posts`
        )
        if (posts.some((p) => p.channel_id === postChannelId)) {
          found = true
          break
        }
      }

      if (found) {
        toast.success("Panel posted.", { id: toastId })
        const posts = await apiFetch<PanelPostRow[]>(
          `/api/venues/${venueId}/reaction-role-panels/${postTarget.id}/posts`
        )
        setPostsByPanel((prev) => ({ ...prev, [postTarget.id]: posts }))
      } else {
        toast.info("Still working — refresh in a moment.", { id: toastId })
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to post panel.", { id: toastId })
    } finally {
      setPosting(false)
      setPostTarget(null)
      setPostChannelId("")
    }
  }

  if (notConnected) {
    return (
      <Alert>
        <AlertDescription>{NOT_CONNECTED_MESSAGE}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex gap-2">
          <ReactionRolePanelFormDialog venueId={venueId} onCreated={handleCreated} onUpdated={handleUpdated} />
          <ApplyTemplateDialog venueId={venueId} templates={templates} onApplied={handleCreated} />
        </div>
      )}

      {panels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reaction-role panels yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {panels.map((panel) => (
            <Card key={panel.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <Badge variant="tag">{panel.message_type}</Badge>
              </CardHeader>
              <CardContent>
                <p className="font-semibold">{panel.title ?? `#${panel.id}`}</p>
                {panel.description && <p className="text-sm text-muted-foreground">{panel.description}</p>}
                <ul className="text-sm mt-2 space-y-1">
                  {panel.options.map((opt) => (
                    <li key={opt.id} className="flex items-center gap-2">
                      <span>{opt.emoji ?? "•"}</span>
                      <span>{opt.label ?? "(no label)"}</span>
                      <span className="text-muted-foreground text-xs">role {opt.role_id}</span>
                    </li>
                  ))}
                </ul>

                <p className="text-xs text-muted-foreground mt-2">
                  {(postsByPanel[panel.id]?.length ?? 0) > 0
                    ? `Posted to ${postsByPanel[panel.id].length} channel${postsByPanel[panel.id].length === 1 ? "" : "s"}`
                    : "Not posted anywhere yet"}
                </p>

                {canManage && (
                  <div className="flex gap-2 mt-3">
                    <ReactionRolePanelFormDialog
                      venueId={venueId}
                      panel={panel}
                      onCreated={handleCreated}
                      onUpdated={handleUpdated}
                      trigger={
                        <Button size="sm" variant="outline">
                          Edit
                        </Button>
                      }
                    />
                    <Button size="sm" variant="outline" onClick={() => setPostTarget(panel)}>
                      Post to channel
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(panel)}>
                      Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleteTarget?.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Every posted copy of this panel comes down first. This cannot be undone.
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

      <AlertDialog
        open={!!postTarget}
        onOpenChange={(open) => {
          if (!open) {
            setPostTarget(null)
            setPostChannelId("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post &quot;{postTarget?.title}&quot; to a channel</AlertDialogTitle>
            <AlertDialogDescription>Enter the Discord channel ID to post this panel to.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Channel ID"
            value={postChannelId}
            onChange={(e) => setPostChannelId(e.target.value)}
            disabled={posting}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={posting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPost} disabled={posting || !postChannelId}>
              {posting ? "Posting..." : "Post"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
