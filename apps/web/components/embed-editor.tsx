"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { EmbedPosts } from "@/components/embed-posts"
import { EmbedPreview } from "@/components/embed-preview"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import {
  EMBED_LIMITS,
  draftToBody,
  embedProblems,
  embedTotalLength,
  emptyDraft,
  rowToDraft,
  type EmbedDraft,
} from "@/lib/embed-draft"
import type { EmbedRow } from "@/lib/api/xvm-api"

interface TextBoxProps {
  id: string
  label: string
  value: string
  max: number
  onChange: (value: string) => void
  disabled: boolean
  multiline?: boolean
  placeholder?: string
}

export function TextBox({ id, label, value, max, onChange, disabled, multiline, placeholder }: TextBoxProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {value.length} / {max}
        </span>
      </div>
      {multiline ? (
        <Textarea id={id} value={value} maxLength={max} rows={4} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} />
      ) : (
        <Input id={id} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} />
      )}
    </div>
  )
}

export interface EmbedEditorProps {
  venueId: string
  embed: EmbedRow | null
  canManage: boolean
  onSaved: (embed: EmbedRow, created: boolean) => void
  onClose: () => void
}

export function EmbedEditor({ venueId, embed, canManage, onSaved, onClose }: EmbedEditorProps) {
  const [draft, setDraft] = useState<EmbedDraft>(embed ? rowToDraft(embed) : emptyDraft)
  const [saving, setSaving] = useState(false)
  const [pickerKey, setPickerKey] = useState(0)
  const locked = !canManage || saving
  const problems = embedProblems(draft)
  const total = embedTotalLength(draft)

  function set<K extends keyof EmbedDraft>(key: K, value: EmbedDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function setField(index: number, patch: Partial<EmbedDraft["fields"][number]>) {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    }))
  }

  async function save() {
    if (problems.length > 0) {
      toast.error(problems[0])
      return
    }
    setSaving(true)
    try {
      const headers = { "Content-Type": "application/json" }
      const body = JSON.stringify(draftToBody(draft))
      const saved = embed
        ? await apiRoute<EmbedRow>("/api/venues/[venueId]/embeds/[embedId]", {
            params: { venueId, embedId: embed.id },
            method: "PATCH",
            headers,
            body,
          })
        : await apiRoute<EmbedRow>("/api/venues/[venueId]/embeds", { params: { venueId }, method: "POST", headers, body })
      toast.success(embed ? "Embed saved. Posted copies are refreshed." : "Embed created.")
      onSaved(saved, embed === null)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save the embed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={onClose}>
          Back to embeds
        </Button>
        {canManage && (
          <Button onClick={save} disabled={saving || problems.length > 0}>
            {saving ? "Saving..." : "Save embed"}
          </Button>
        )}
      </div>

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
              <TextBox id="embed-name" label="Name (only you see it)" value={draft.name} max={EMBED_LIMITS.name} onChange={(v) => set("name", v)} disabled={locked} />
              <TextBox id="embed-author" label="Author name" value={draft.authorName} max={EMBED_LIMITS.author} onChange={(v) => set("authorName", v)} disabled={locked} />
              <TextBox id="embed-author-icon" label="Author icon address" value={draft.authorIconUrl} max={EMBED_LIMITS.url} onChange={(v) => set("authorIconUrl", v)} disabled={locked} placeholder="https://" />
              <p className="text-xs text-muted-foreground">The preview only shows images from hosts the dashboard allows. Discord itself shows any image.</p>
              <TextBox id="embed-author-url" label="Author link" value={draft.authorUrl} max={EMBED_LIMITS.url} onChange={(v) => set("authorUrl", v)} disabled={locked} placeholder="https://" />
              <TextBox id="embed-title" label="Title" value={draft.title} max={EMBED_LIMITS.title} onChange={(v) => set("title", v)} disabled={locked} />
              <TextBox id="embed-url" label="Title link" value={draft.url} max={EMBED_LIMITS.url} onChange={(v) => set("url", v)} disabled={locked} placeholder="https://" />
              <TextBox id="embed-description" label="Description" value={draft.description} max={EMBED_LIMITS.description} onChange={(v) => set("description", v)} disabled={locked} multiline />

              <div className="space-y-1.5">
                <Label htmlFor="embed-color">Colour</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="embed-color"
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
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Fields</p>
                <span className="text-xs text-muted-foreground">
                  {draft.fields.length} / {EMBED_LIMITS.fields}
                </span>
              </div>
              {draft.fields.map((field, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-[var(--blue-018)] p-3">
                  <TextBox id={`embed-field-name-${index}`} label={`Field ${index + 1} name`} value={field.name} max={EMBED_LIMITS.fieldName} onChange={(v) => setField(index, { name: v })} disabled={locked} />
                  <TextBox id={`embed-field-value-${index}`} label={`Field ${index + 1} value`} value={field.value} max={EMBED_LIMITS.fieldValue} onChange={(v) => setField(index, { value: v })} disabled={locked} multiline />
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <Switch checked={field.inline} onCheckedChange={(v) => setField(index, { inline: v })} disabled={locked} aria-label={`Field ${index + 1} inline`} />
                      Inline
                    </span>
                    {canManage && (
                      <Button size="sm" variant="outline" disabled={saving} onClick={() => set("fields", draft.fields.filter((_, i) => i !== index))}>
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {canManage && (
                <Button size="sm" variant="outline" disabled={saving || draft.fields.length >= EMBED_LIMITS.fields} onClick={() => set("fields", [...draft.fields, { name: "", value: "", inline: true }])}>
                  Add field
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <TextBox id="embed-thumbnail" label="Thumbnail address" value={draft.thumbnailUrl} max={EMBED_LIMITS.url} onChange={(v) => set("thumbnailUrl", v)} disabled={locked} placeholder="https://" />
              <p className="text-xs text-muted-foreground">The preview only shows images from hosts the dashboard allows. Discord itself shows any image.</p>
              <TextBox id="embed-image" label="Image address" value={draft.imageUrl} max={EMBED_LIMITS.url} onChange={(v) => set("imageUrl", v)} disabled={locked} placeholder="https://" />
              <p className="text-xs text-muted-foreground">The preview only shows images from hosts the dashboard allows. Discord itself shows any image.</p>
              <TextBox id="embed-footer" label="Footer text" value={draft.footerText} max={EMBED_LIMITS.footer} onChange={(v) => set("footerText", v)} disabled={locked} />
              <TextBox id="embed-footer-icon" label="Footer icon address" value={draft.footerIconUrl} max={EMBED_LIMITS.url} onChange={(v) => set("footerIconUrl", v)} disabled={locked} placeholder="https://" />
              <p className="text-xs text-muted-foreground">The preview only shows images from hosts the dashboard allows. Discord itself shows any image.</p>
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
                    <button type="button" onClick={() => {
                        set("timestamp", "")
                        setPickerKey((k) => k + 1)
                      }}
                      className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]">
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <EmbedPreview draft={draft} />
          <p className={`text-xs ${total > EMBED_LIMITS.total ? "text-red-400" : "text-muted-foreground"}`}>
            {total} / {EMBED_LIMITS.total} characters across the title, description, author, footer and fields.
          </p>
          {embed && <EmbedPosts venueId={venueId} embedId={embed.id} canManage={canManage} />}
        </div>
      </div>
    </div>
  )
}
