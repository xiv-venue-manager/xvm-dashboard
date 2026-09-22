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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import type { PanelRow, TemplateRow } from "@/lib/api/xvm-api"

const SNOWFLAKE_PATTERN = /^\d+$/
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 15000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface ApplyTemplateDialogProps {
  venueId: string
  templates: TemplateRow[]
  onApplied: (panel: PanelRow) => void
}

export function ApplyTemplateDialog({ venueId, templates, onApplied }: ApplyTemplateDialogProps) {
  const [open, setOpen] = useState(false)
  const [templateId, setTemplateId] = useState<string>("")
  const [channelId, setChannelId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setTemplateId("")
    setChannelId("")
  }

  async function handleSubmit() {
    if (!templateId) {
      toast.error("Choose a template.")
      return
    }
    if (!SNOWFLAKE_PATTERN.test(channelId)) {
      toast.error("Channel ID must be numeric.")
      return
    }

    setSubmitting(true)
    const toastId = toast.loading("Asking the bot...")
    try {
      const before = await apiFetch<PanelRow[]>(`/api/venues/${venueId}/reaction-role-panels`)
      const beforeIds = new Set(before.map((p) => p.id))

      await apiFetch(`/api/venues/${venueId}/reaction-role-panels/from-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: Number(templateId), channelId }),
      })

      const deadline = Date.now() + POLL_TIMEOUT_MS
      let found = false
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS)
        const after = await apiFetch<PanelRow[]>(`/api/venues/${venueId}/reaction-role-panels`)
        const newPanel = after.find((p) => !beforeIds.has(p.id))
        if (newPanel) {
          found = true
          onApplied(newPanel)
          break
        }
      }

      if (found) {
        toast.success("Template applied.", { id: toastId })
      } else {
        toast.info("Still working — refresh in a moment.", { id: toastId })
      }
      setOpen(false)
      reset()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to apply template.", { id: toastId })
    } finally {
      setSubmitting(false)
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
      <DialogTrigger asChild>
        <Button variant="outline">Apply Template</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply a Template</DialogTitle>
          <DialogDescription>The bot creates the roles and builds the panel.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-select">Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="template-select">
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name} ({t.options.length} role{t.options.length === 1 ? "" : "s"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-channel">Channel ID</Label>
            <Input
              id="template-channel"
              placeholder="Channel ID"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Applying..." : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
