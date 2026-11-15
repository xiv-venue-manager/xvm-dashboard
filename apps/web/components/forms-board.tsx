"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { FormEditor } from "@/components/form-editor"
import { useDiscordOptions } from "@/components/discord-picker"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import type { FormRow } from "@/lib/api/xvm-api"

export interface FormsBoardProps {
  venueId: string
  forms: FormRow[]
}

export function FormsBoard({ venueId, forms: initialForms }: FormsBoardProps) {
  const [forms, setForms] = useState(initialForms)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FormRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const channels = useDiscordOptions(venueId, "channels", forms.some((form) => form.response_channel_id !== null))
  const channelName = (id: string) => channels.options.find((o) => o.value === id)?.label ?? id

  const editing = forms.find((form) => form.id === editingId) ?? null

  async function create() {
    if (name.trim() === "") {
      toast.error("Give the form a name.")
      return
    }
    setCreating(true)
    try {
      const created = await apiRoute<FormRow>("/api/venues/[venueId]/forms", {
        params: { venueId },
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })
      setForms((prev) => [...prev, created])
      setName("")
      setEditingId(created.id)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to create the form.")
    } finally {
      setCreating(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiRoute("/api/venues/[venueId]/forms/[formId]", { params: { venueId, formId: deleteTarget.id }, method: "DELETE" })
      setForms((prev) => prev.filter((form) => form.id !== deleteTarget.id))
      toast.success("Form deleted.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to delete the form.")
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (editing) {
    return (
      <FormEditor
        key={editing.id}
        venueId={venueId}
        form={editing}
        onChange={(next) => setForms((prev) => prev.map((form) => (form.id === next.id ? next : form)))}
        onClose={() => setEditingId(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-5">
          <Input
            aria-label="New form name"
            placeholder="Name of a new form"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !creating && create()}
            disabled={creating}
            className="max-w-xs"
          />
          <Button onClick={create} disabled={creating}>
            {creating ? "Creating..." : "New form"}
          </Button>
        </CardContent>
      </Card>

      {forms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No forms yet.</p>
      ) : (
        <div className="space-y-3">
          {forms.map((form) => (
            <Card key={form.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-[10rem] flex-1">
                  <p className="font-semibold">{form.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {form.questions.length} {form.questions.length === 1 ? "question" : "questions"},{" "}
                    {form.response_channel_id ? `responses to ${channelName(form.response_channel_id)}` : "no response channel"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline-blue" onClick={() => setEditingId(form.id)}>
                    Open
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteTarget(form)}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name ?? "this form"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its questions and every response are deleted, and the bot stops answering its buttons. This cannot be undone.
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
