"use client"

import { useRef, useState } from "react"
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
import { RolePicker } from "@/components/discord-picker"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import { addInOrder, draftProblem, type DraftOption } from "@/lib/reaction-role-option-draft"
import type { PanelRow, ReactionRoleOptionRow } from "@/lib/api/xvm-api"

interface ReactionRolePanelFormDialogProps {
  venueId: string
  panel?: PanelRow
  trigger?: React.ReactNode
  onCreated: (panel: PanelRow) => void
  onUpdated: (panel: PanelRow) => void
}

interface PendingOption extends DraftOption {
  key: number
  error?: string
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
  const [optionBusy, setOptionBusy] = useState(false)
  const [pending, setPending] = useState<PendingOption[]>([])
  const nextKey = useRef(0)

  function reset() {
    setTitle(panel?.title ?? "")
    setDescription(panel?.description ?? "")
    setColor(panel?.color != null ? `#${panel.color.toString(16).padStart(6, "0")}` : "#5865f2")
    setMessageType(panel?.message_type ?? "normal")
    setOptions(panel?.options ?? [])
    setSavedPanelId(panel?.id ?? null)
    setDraft({ roleId: "", label: "", emoji: "" })
    setPending([])
  }

  function postOption(panelId: number, option: DraftOption) {
    return apiFetch<ReactionRoleOptionRow>(`/api/venues/${venueId}/reaction-role-panels/${panelId}/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roleId: option.roleId,
        label: option.label.trim() || null,
        emoji: option.emoji.trim() || null,
      }),
    })
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
        if (pending.length === 0) {
          toast.success("Panel created. Add options below, then close when done.")
          return
        }
        const result = await addInOrder(pending, (option) => postOption(created.id, option))
        setOptions(result.created)
        setPending(result.failed.map(({ item, error }) => ({ ...item, error })))
        onUpdated({ ...created, options: result.created })
        if (result.failed.length === 0) {
          toast.success("Panel created.")
          setOpen(false)
        } else {
          toast.error(`Panel created, but ${result.failed.length} of ${pending.length} options were not added.`)
        }
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save panel.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddOption() {
    if (optionBusy) return
    const problem = draftProblem(draft, [...options.map((o) => o.role_id), ...pending.map((o) => o.roleId)])
    if (problem) {
      toast.error(problem)
      return
    }
    if (!savedPanelId) {
      setPending((prev) => [...prev, { ...draft, key: nextKey.current++ }])
      setDraft({ roleId: "", label: "", emoji: "" })
      return
    }

    setOptionBusy(true)
    try {
      const option = await postOption(savedPanelId, draft)
      setOptions((prev) => [...prev, option])
      setDraft({ roleId: "", label: "", emoji: "" })
      toast.success("Option added.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to add option.")
    } finally {
      setOptionBusy(false)
    }
  }

  async function handleRetryPending(item: PendingOption) {
    if (!savedPanelId || optionBusy) return
    setOptionBusy(true)
    try {
      const option = await postOption(savedPanelId, item)
      setOptions((prev) => [...prev, option])
      setPending((prev) => prev.filter((p) => p.key !== item.key))
    } catch (e) {
      const error = e instanceof Error ? e.message : "Failed to add option."
      setPending((prev) => prev.map((p) => (p.key === item.key ? { ...p, error } : p)))
    } finally {
      setOptionBusy(false)
    }
  }

  async function handleDeleteOption(optionId: number) {
    if (!savedPanelId || optionBusy) return
    setOptionBusy(true)
    try {
      await apiFetch(`/api/venues/${venueId}/reaction-role-panels/${savedPanelId}/options/${optionId}`, {
        method: "DELETE",
      })
      setOptions((prev) => prev.filter((o) => o.id !== optionId))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove option.")
    } finally {
      setOptionBusy(false)
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
            <Input
              id="panel-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
              maxLength={256}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="panel-description">Description</Label>
            <Textarea
              id="panel-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              maxLength={4096}
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
            {options.length === 0 && pending.length === 0 && (
              <p className="text-sm text-muted-foreground">No options yet.</p>
            )}
            {options.map((opt) => (
              <div key={opt.id} className="flex items-center gap-2 text-sm">
                <span>{opt.emoji ?? "•"}</span>
                <span className="flex-1">{opt.label ?? "(no label)"}</span>
                <span className="text-muted-foreground text-xs">role {opt.role_id}</span>
                <Button size="sm" variant="ghost" onClick={() => handleDeleteOption(opt.id)} disabled={optionBusy}>
                  Remove
                </Button>
              </div>
            ))}
            {pending.map((item) => (
              <div key={item.key} className="text-sm">
                <div className="flex items-center gap-2">
                  <span>{item.emoji.trim() || "•"}</span>
                  <span className="flex-1">{item.label.trim() || "(no label)"}</span>
                  <span className="text-muted-foreground text-xs">role {item.roleId}</span>
                  {savedPanelId && (
                    <Button size="sm" variant="ghost" onClick={() => handleRetryPending(item)} disabled={optionBusy}>
                      Retry
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPending((prev) => prev.filter((p) => p.key !== item.key))}
                    disabled={optionBusy}
                  >
                    Remove
                  </Button>
                </div>
                {item.error && <p className="text-xs text-destructive">Not added: {item.error}</p>}
              </div>
            ))}
            <div className="flex gap-2">
              <RolePicker
                venueId={venueId}
                value={draft.roleId}
                onChange={(roleId) => setDraft({ ...draft, roleId })}
                disabled={submitting || optionBusy}
              />
              <Input
                placeholder="Label"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                disabled={submitting || optionBusy}
                maxLength={80}
              />
              <Input
                placeholder="Emoji"
                value={draft.emoji}
                onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                disabled={submitting || optionBusy}
                maxLength={64}
              />
              <Button type="button" variant="outline" onClick={handleAddOption} disabled={submitting || optionBusy}>
                Add
              </Button>
            </div>
            {!savedPanelId && (
              <p className="text-xs text-muted-foreground">Options are added when you create the panel.</p>
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
