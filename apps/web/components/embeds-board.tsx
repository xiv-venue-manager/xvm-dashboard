"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
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
import { EmbedEditor } from "@/components/embed-editor"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import type { EmbedRow } from "@/lib/api/xvm-api"

export interface EmbedsBoardProps {
  venueId: string
  canManage: boolean
  embeds: EmbedRow[]
}

export function EmbedsBoard({ venueId, canManage, embeds: initialEmbeds }: EmbedsBoardProps) {
  const [embeds, setEmbeds] = useState(initialEmbeds)
  const [editing, setEditing] = useState<EmbedRow | "new" | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EmbedRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  function handleSaved(saved: EmbedRow, created: boolean) {
    setEmbeds((prev) => {
      const next = created ? [...prev, saved] : prev.map((e) => (e.id === saved.id ? saved : e))
      return next.sort((a, b) => a.name.localeCompare(b.name))
    })
    setEditing(saved)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiRoute("/api/venues/[venueId]/embeds/[embedId]", {
        params: { venueId, embedId: deleteTarget.id },
        method: "DELETE",
      })
      setEmbeds((prev) => prev.filter((e) => e.id !== deleteTarget.id))
      toast.success("Embed deleted. Posted copies are taken down.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to delete the embed.")
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (editing !== null) {
    return (
      <EmbedEditor
        key={editing === "new" ? "new" : editing.id}
        venueId={venueId}
        embed={editing === "new" ? null : editing}
        canManage={canManage}
        onSaved={handleSaved}
        onClose={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{embeds.length} saved embeds.</p>
        {canManage && <Button size="sm" onClick={() => setEditing("new")}>New embed</Button>}
      </div>

      {embeds.length === 0 ? (
        <p className="text-sm text-muted-foreground">No embeds yet.</p>
      ) : (
        <div className="space-y-3">
          {embeds.map((embed) => (
            <Card key={embed.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-[10rem] flex-1">
                  <p className="font-semibold">{embed.name}</p>
                  {embed.title !== null && <p className="text-sm text-muted-foreground">{embed.title}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline-blue" onClick={() => setEditing(embed)}>
                    {canManage ? "Edit" : "View"}
                  </Button>
                  {canManage && (
                    <Button size="sm" variant="outline" onClick={() => setDeleteTarget(embed)}>
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
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every copy of it already posted in Discord is taken down. This cannot be undone.
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
