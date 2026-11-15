"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { EditorHeader } from "@/components/editor-header"
import { Card, CardContent } from "@/components/ui/card"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ChannelPicker } from "@/components/discord-picker"
import { EmbedPreview } from "@/components/embed-preview"
import { TextBox } from "@/components/embed-editor"
import { StickyImageSlot } from "@/components/sticky-image-slot"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import {
  STICKY_LIMITS,
  emptyStickyDraft,
  stickyDraftToBody,
  stickyProblems,
  stickyRowToDraft,
  stickyToEmbedDraft,
  stickyTotalLength,
  type StickyDraft,
} from "@/lib/sticky-draft"
import type { StickyImageSlot as Slot, StickyRow } from "@/lib/api/xvm-api"

const IMAGE_SLOTS: { slot: Slot; label: string; key: keyof StickyRow }[] = [
  { slot: "header_icon", label: "Header icon", key: "header_icon_url" },
  { slot: "footer_icon", label: "Footer icon", key: "footer_icon_url" },
  { slot: "thumbnail", label: "Thumbnail", key: "thumbnail_url" },
  { slot: "image", label: "Image", key: "image_url" },
]

export interface StickyEditorProps {
  venueId: string
  sticky: StickyRow | null
  canManage: boolean
  onSaved: (sticky: StickyRow, created: boolean) => void
  onClose: () => void
}

export function StickyEditor({ venueId, sticky, canManage, onSaved, onClose }: StickyEditorProps) {
  const [row, setRow] = useState<StickyRow | null>(sticky)
  const [draft, setDraft] = useState<StickyDraft>(sticky ? stickyRowToDraft(sticky) : emptyStickyDraft)
  const [saving, setSaving] = useState(false)
  const rowRef = useRef(row)
  useEffect(() => {
    rowRef.current = row
  }, [row])
  const [pickerKey, setPickerKey] = useState(0)
  const locked = !canManage || saving
  const problems = stickyProblems(draft)
  const total = stickyTotalLength(draft)

  function set<K extends keyof StickyDraft>(key: K, value: StickyDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function changeImages(patch: Partial<StickyRow>) {
    if (!row) return
    const next = { ...row, ...patch }
    setRow(next)
    onSaved(next, false)
  }

  async function save() {
    if (problems.length > 0) {
      toast.error(problems[0])
      return
    }
    setSaving(true)
    try {
      const headers = { "Content-Type": "application/json" }
      const body = stickyDraftToBody(draft)
      const saved = row
        ? await apiRoute<StickyRow>("/api/venues/[venueId]/sticky-messages/[stickyId]", {
            params: { venueId, stickyId: row.id },
            method: "PATCH",
            headers,
            body: JSON.stringify({ ...body, channel_id: undefined }),
          })
        : await apiRoute<StickyRow>("/api/venues/[venueId]/sticky-messages", {
            params: { venueId },
            method: "POST",
            headers,
            body: JSON.stringify(body),
          })
      toast.success(row ? "Sticky saved. The bot reposts it." : "Sticky created.")
      const created = row === null
      const latest = rowRef.current
      const merged = latest
        ? {
            ...saved,
            header_icon_url: latest.header_icon_url,
            footer_icon_url: latest.footer_icon_url,
            thumbnail_url: latest.thumbnail_url,
            image_url: latest.image_url,
          }
        : saved
      setRow(merged)
      onSaved(merged, created)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save the sticky.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <EditorHeader backTo="Sticky Messages" onBack={onClose}>
        {canManage && (
          <Button onClick={save} disabled={saving || problems.length > 0}>
            {saving ? "Saving..." : "Save sticky"}
          </Button>
        )}
      </EditorHeader>

      {canManage && problems.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="space-y-1.5">
                <Label htmlFor="sticky-channel">Channel</Label>
                <ChannelPicker
                  venueId={venueId}
                  id="sticky-channel"
                  value={draft.channelId}
                  onChange={(v) => set("channelId", v)}
                  disabled={locked || row !== null}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="sticky-enabled">Keep it at the bottom of the channel</Label>
                <Switch id="sticky-enabled" checked={draft.enabled} onCheckedChange={(v) => set("enabled", v)} disabled={locked} />
              </div>
              <TextBox id="sticky-header" label="Header text" value={draft.headerText} max={STICKY_LIMITS.header} onChange={(v) => set("headerText", v)} disabled={locked} />
              <TextBox id="sticky-header-url" label="Header link" value={draft.headerUrl} max={STICKY_LIMITS.url} onChange={(v) => set("headerUrl", v)} disabled={locked} placeholder="https://" />
              <TextBox id="sticky-title" label="Title" value={draft.title} max={STICKY_LIMITS.title} onChange={(v) => set("title", v)} disabled={locked} />
              <TextBox id="sticky-url" label="Title link" value={draft.url} max={STICKY_LIMITS.url} onChange={(v) => set("url", v)} disabled={locked} placeholder="https://" />
              <TextBox id="sticky-description" label="Description" value={draft.description} max={STICKY_LIMITS.description} onChange={(v) => set("description", v)} disabled={locked} multiline />
              <TextBox id="sticky-footer" label="Footer text" value={draft.footerText} max={STICKY_LIMITS.footer} onChange={(v) => set("footerText", v)} disabled={locked} />

              <div className="space-y-1.5">
                <Label htmlFor="sticky-color">Colour</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="sticky-color"
                    type="color"
                    value={draft.color || "#5865f2"}
                    disabled={locked}
                    onChange={(e) => set("color", e.target.value)}
                    className="h-7 w-7 cursor-pointer appearance-none rounded-full border border-[var(--blue-018)] bg-transparent p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
                  />
                  {draft.color !== "" && !locked && (
                    <button type="button" onClick={() => set("color", "")} className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]">
                      No colour
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Timestamp</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <fieldset disabled={locked} className="contents">
                    <DateTimePicker
                      key={pickerKey}
                      date={draft.timestamp !== "" ? new Date(draft.timestamp) : undefined}
                      onDateChange={(date) => {
                        if (date) set("timestamp", date.toISOString())
                      }}
                      placeholder="No timestamp"
                    />
                  </fieldset>
                  {draft.timestamp !== "" && !locked && (
                    <button
                      type="button"
                      onClick={() => {
                        set("timestamp", "")
                        setPickerKey((k) => k + 1)
                      }}
                      className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <p className="font-semibold">Images</p>
              {row === null ? (
                <p className="text-sm text-muted-foreground">Save the sticky first, then add images.</p>
              ) : (
                IMAGE_SLOTS.map(({ slot, label, key }) => (
                  <StickyImageSlot
                    key={slot}
                    venueId={venueId}
                    stickyId={row.id}
                    slot={slot}
                    label={label}
                    url={row[key] as string | null}
                    canManage={canManage}
                    onChange={changeImages}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <EmbedPreview draft={stickyToEmbedDraft(draft, row)} />
          <p className={`text-xs ${total > STICKY_LIMITS.total ? "text-red-400" : "text-muted-foreground"}`}>
            {total} / {STICKY_LIMITS.total} characters across the title, description, header and footer.
          </p>
        </div>
      </div>
    </div>
  )
}
