"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import type { PanelRow, ReactionRoleOptionRow } from "@/lib/api/xvm-api"

const SNOWFLAKE_PATTERN = /^\d+$/

interface ReactionRolePanelFormDialogProps {
  venueId: string
  panel?: PanelRow
  trigger?: React.ReactNode
  onCreated: (panel: PanelRow) => void
  onUpdated: (panel: PanelRow) => void
}

interface DraftOption {
  roleId: string
  label: string
  emoji: string
}

export function ReactionRolePanelFormDialog({
  venueId,
  panel,
  trigger,
  onCreated,
  onUpdated,
}: ReactionRolePanelFormDialogProps) {
  const isEdit = !!panel
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [title, setTitle] = useState(panel?.title ?? "")
  const [description, setDescription] = useState(panel?.description ?? "")
  const [color, setColor] = useState(panel?.color != null ? `#${panel.color.toString(16).padStart(6, "0")}` : "#5865f2")
  const [messageType, setMessageType] = useState<"normal" | "unique" | "verify">(panel?.message_type ?? "normal")
  const [options, setOptions] = useState<ReactionRoleOptionRow[]>(panel?.options ?? [])
  const [draft, setDraft] = useState<DraftOption>({ roleId: "", label: "", emoji: "" })
  const [savedPanelId, setSavedPanelId] = useState<number | null>(panel?.id ?? null)

  function reset() {
    setTitle(panel?.title ?? "")
    setDescription(panel?.description ?? "")
    setColor(panel?.color != null ? `#${panel.color.toString(16).padStart(6, "0")}` : "#5865f2")
    setMessageType(panel?.message_type ?? "normal")
    setOptions(panel?.options ?? [])
    setSavedPanelId(panel?.id ?? null)
    setDraft({ roleId: "", label: "", emoji: "" })
  }

  async function handleSubmit() {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      toast.error("Please enter a title")
      return
    }

    setSubmitting(true)
    try {
      const body = {
        title: trimmedTitle,
        description: description.trim() || null,
        color: parseInt(color.replace("#", ""), 16),
        messageType,
      }

      if (savedPanelId) {
        const updated = await apiFetch<PanelRow>(`/api/venues/${venueId}/reaction-role-panels/${savedPanelId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        onUpdated({ ...updated, options })
        toast.success(isEdit ? "Panel updated." : "Panel saved.")
        setOpen(false)
      } else {
        const created = await apiFetch<PanelRow>(`/api/venues/${venueId}/reaction-role-panels`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        setSavedPanelId(created.id)
        onCreated(created)
        toast.success("Panel created — add options below, then close when done.")
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save panel.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddOption() {
    if (!savedPanelId) {
      toast.error("Save the panel first before adding options.")
      return
    }
    if (!SNOWFLAKE_PATTERN.test(draft.roleId)) {
      toast.error("Role ID must be numeric.")
      return
    }
    if (!draft.label.trim() && !draft.emoji.trim()) {
      toast.error("An option needs a label or an emoji.")
      return
    }

    try {
      const option = await apiFetch<ReactionRoleOptionRow>(
        `/api/venues/${venueId}/reaction-role-panels/${savedPanelId}/options`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleId: draft.roleId,
            label: draft.label.trim() || null,
            emoji: draft.emoji.trim() || null,
          }),
        }
      )
      setOptions((prev) => [...prev, option])
      setDraft({ roleId: "", label: "", emoji: "" })
      toast.success("Option added.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to add option.")
    }
  }

  async function handleDeleteOption(optionId: number) {
    if (!savedPanelId) return
    try {
      await apiFetch(`/api/venues/${venueId}/reaction-role-panels/${savedPanelId}/options/${optionId}`, {
        method: "DELETE",
      })
      setOptions((prev) => prev.filter((o) => o.id !== optionId))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove option.")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger asChild>{trigger ?? <Button>+ New Panel</Button>}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Panel" : "New Reaction Role Panel"}</DialogTitle>
          <DialogDescription>Configure the panel, then add one row per role.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="panel-title">Title</Label>
            <Input id="panel-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="panel-description">Description</Label>
            <Textarea
              id="panel-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="panel-color">Color</Label>
              <Input
                id="panel-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="panel-message-type">Button behavior</Label>
              <Select value={messageType} onValueChange={(v) => setMessageType(v as typeof messageType)}>
                <SelectTrigger id="panel-message-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal (toggle)</SelectItem>
                  <SelectItem value="unique">Unique (one at a time)</SelectItem>
                  <SelectItem value="verify">Verify (grant only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label>Options</Label>
            {options.length === 0 && <p className="text-sm text-muted-foreground">No options yet.</p>}
            {options.map((opt) => (
              <div key={opt.id} className="flex items-center gap-2 text-sm">
                <span>{opt.emoji ?? "•"}</span>
                <span className="flex-1">{opt.label ?? "(no label)"}</span>
                <span className="text-muted-foreground text-xs">role {opt.role_id}</span>
                <Button size="sm" variant="ghost" onClick={() => handleDeleteOption(opt.id)}>
                  Remove
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                placeholder="Role ID"
                value={draft.roleId}
                onChange={(e) => setDraft({ ...draft, roleId: e.target.value })}
                disabled={!savedPanelId}
              />
              <Input
                placeholder="Label"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                disabled={!savedPanelId}
              />
              <Input
                placeholder="Emoji"
                value={draft.emoji}
                onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                disabled={!savedPanelId}
              />
              <Button type="button" variant="outline" onClick={handleAddOption} disabled={!savedPanelId}>
                Add
              </Button>
            </div>
            {!savedPanelId && (
              <p className="text-xs text-muted-foreground">Save the panel first to add options.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            {savedPanelId && !isEdit ? "Done" : "Cancel"}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : isEdit ? "Save Changes" : savedPanelId ? "Save Details" : "Create Panel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
