"use client"

import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { PillToggle } from "@/components/pill-toggle"
import { ChannelPicker, useDiscordOptions } from "@/components/discord-picker"
import { EmojiPicker } from "@/components/emoji-picker"
import { FormQuestions } from "@/components/form-questions"
import { FormResponses } from "@/components/form-responses"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { colorToHex, hexToColor } from "@/lib/audit-log-events"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import { useMounted } from "@/lib/use-mounted"
import type { FormPostRow, FormRow } from "@/lib/api/xvm-api"

type Section = "details" | "questions" | "post" | "responses"

const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
  { id: "details", label: "Details" },
  { id: "questions", label: "Questions" },
  { id: "post", label: "Post" },
  { id: "responses", label: "Responses" },
]

export interface FormEditorProps {
  venueId: string
  form: FormRow
  onChange: (form: FormRow) => void
  onClose: () => void
}

function Details({ venueId, form, onChange }: Pick<FormEditorProps, "venueId" | "form" | "onChange">) {
  const [name, setName] = useState(form.name)
  const [description, setDescription] = useState(form.description ?? "")
  const [prePrompt, setPrePrompt] = useState(form.pre_prompt ?? "")
  const [postPrompt, setPostPrompt] = useState(form.post_prompt ?? "")
  const [color, setColor] = useState(form.color === null ? "" : colorToHex(form.color))
  const [buttonLabel, setButtonLabel] = useState(form.button_label)
  const [buttonEmoji, setButtonEmoji] = useState(form.button_emoji ?? "")
  const [allowMultiple, setAllowMultiple] = useState(form.allow_multiple_responses)
  const [responseChannel, setResponseChannel] = useState(form.response_channel_id ?? "")
  const [saving, setSaving] = useState(false)
  const [thumbBusy, setThumbBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save() {
    if (name.trim() === "") {
      toast.error("Give the form a name.")
      return
    }
    if (buttonLabel.trim() === "") {
      toast.error("The button needs a label.")
      return
    }
    if (responseChannel !== "" && !SNOWFLAKE_PATTERN.test(responseChannel)) {
      toast.error("Channel ID must be numeric.")
      return
    }
    setSaving(true)
    try {
      const saved = await apiRoute<FormRow>("/api/venues/[venueId]/forms/[formId]", {
        params: { venueId, formId: form.id },
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description,
          prePrompt,
          postPrompt,
          color: color === "" ? null : hexToColor(color),
          buttonLabel: buttonLabel.trim(),
          buttonEmoji,
          allowMultipleResponses: allowMultiple,
          responseChannelId: responseChannel === "" ? null : responseChannel,
        }),
      })
      onChange(saved)
      toast.success("Form saved.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message.replace(/^Value error, /, "") : "Failed to save the form.")
    } finally {
      setSaving(false)
    }
  }

  async function upload() {
    if (!file) return
    setThumbBusy(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const saved = await apiRoute<FormRow>("/api/venues/[venueId]/forms/[formId]/thumbnail", {
        params: { venueId, formId: form.id },
        method: "PUT",
        body,
      })
      onChange({ ...form, thumbnail_url: saved.thumbnail_url ?? null })
      setFile(null)
      if (fileRef.current) fileRef.current.value = ""
      toast.success("Thumbnail saved.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to upload the thumbnail.")
    } finally {
      setThumbBusy(false)
    }
  }

  async function removeThumbnail() {
    setThumbBusy(true)
    try {
      await apiRoute("/api/venues/[venueId]/forms/[formId]/thumbnail", { params: { venueId, formId: form.id }, method: "DELETE" })
      onChange({ ...form, thumbnail_url: null })
      toast.success("Thumbnail removed.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove the thumbnail.")
    } finally {
      setThumbBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="space-y-2">
          <Label htmlFor="form-name">Name</Label>
          <Input id="form-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="form-description">Description</Label>
          <Textarea id="form-description" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="form-pre">Shown before the questions</Label>
            <Textarea id="form-pre" rows={3} maxLength={2000} value={prePrompt} onChange={(e) => setPrePrompt(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="form-post">Shown after the questions</Label>
            <Textarea id="form-post" rows={3} maxLength={2000} value={postPrompt} onChange={(e) => setPostPrompt(e.target.value)} disabled={saving} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="form-button-label">Button label</Label>
            <Input id="form-button-label" value={buttonLabel} maxLength={80} onChange={(e) => setButtonLabel(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label>Button emoji</Label>
            <EmojiPicker value={buttonEmoji} onChange={setButtonEmoji} venueId={venueId} source="venue" maxLength={100} disabled={saving} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="form-color">Colour</Label>
          <div className="flex items-center gap-2">
            <input
              id="form-color"
              type="color"
              value={color || "#5865f2"}
              onChange={(e) => setColor(e.target.value)}
              disabled={saving}
              className="h-7 w-7 cursor-pointer appearance-none rounded-full border border-[var(--blue-018)] bg-transparent p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
            />
            {color !== "" && (
              <button type="button" onClick={() => setColor("")} className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]">
                No colour
              </button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Responses go to</Label>
            {responseChannel !== "" && (
              <button type="button" onClick={() => setResponseChannel("")} className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]">
                No channel
              </button>
            )}
          </div>
          <ChannelPicker venueId={venueId} value={responseChannel} onChange={setResponseChannel} disabled={saving} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Allow more than one response per person</p>
            <p className="text-xs text-muted-foreground">Off means each member can submit the form once.</p>
          </div>
          <Switch checked={allowMultiple} onCheckedChange={setAllowMultiple} disabled={saving} aria-label="Allow more than one response per person" />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save details"}
        </Button>

        <div className="space-y-2 border-t pt-5">
          <Label>Thumbnail</Label>
          <div className="flex flex-wrap items-center gap-3">
            {form.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.thumbnail_url} alt="" className="h-12 w-12 rounded object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">None</span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={thumbBusy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="max-w-[14rem] text-xs"
              aria-label="Thumbnail file"
            />
            <Button size="sm" variant="outline-blue" disabled={thumbBusy || !file} onClick={upload}>
              Upload
            </Button>
            {form.thumbnail_url && (
              <Button size="sm" variant="outline" disabled={thumbBusy} onClick={removeThumbnail}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Post({ venueId, form }: Pick<FormEditorProps, "venueId" | "form">) {
  const [channel, setChannel] = useState(form.response_channel_id ?? "")
  const [posting, setPosting] = useState(false)
  const [posts, setPosts] = useState<FormPostRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const channels = useDiscordOptions(venueId, "channels")
  const channelName = (id: string) => channels.options.find((o) => o.value === id)?.label ?? id
  const mounted = useMounted()

  useEffect(() => {
    apiRoute<FormPostRow[]>("/api/venues/[venueId]/forms/[formId]/posts", { params: { venueId, formId: form.id } })
      .then(setPosts)
      .catch(() => setFailed(true))
  }, [venueId, form.id])

  async function post() {
    if (!SNOWFLAKE_PATTERN.test(channel)) {
      toast.error("Choose a channel to post in.")
      return
    }
    if (form.questions.length === 0) {
      toast.error("Add a question before posting the form.")
      return
    }
    setPosting(true)
    try {
      await apiRoute("/api/venues/[venueId]/forms/[formId]/posts", {
        params: { venueId, formId: form.id },
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channel }),
      })
      toast.success("Posting. The bot puts the button in the channel in a moment.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to post the form.")
    } finally {
      setPosting(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div>
          <p className="font-semibold">Post the form</p>
          <p className="text-sm text-muted-foreground">
            The bot posts a button in the channel. Members press it to fill the form in through Discord.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChannelPicker venueId={venueId} value={channel} onChange={setChannel} disabled={posting} />
          <Button onClick={post} disabled={posting}>
            {posting ? "Posting..." : "Post form"}
          </Button>
        </div>
        <div className="space-y-2">
          <Label>Where it is posted</Label>
          {failed ? (
            <p className="text-sm text-muted-foreground">Couldn&apos;t load the posts.</p>
          ) : posts === null ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not posted anywhere yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {posts.map((row) => (
                <li key={`${row.channel_id}-${row.message_id ?? "pending"}`} className="flex flex-wrap justify-between gap-2">
                  <span>{channelName(row.channel_id)}</span>
                  <span className="text-muted-foreground">
                    {row.posted_at ? (mounted ? format(new Date(row.posted_at), "PPp") : "") : "Waiting for the bot"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function FormEditor({ venueId, form, onChange, onClose }: FormEditorProps) {
  const [section, setSection] = useState<Section>("details")

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{form.name}</h2>
        <Button variant="outline" size="sm" onClick={onClose}>
          Back to forms
        </Button>
      </div>
      <PillToggle label="Form section" options={SECTIONS} value={section} onChange={setSection} />
      {section === "details" && <Details venueId={venueId} form={form} onChange={onChange} />}
      {section === "questions" && (
        <FormQuestions venueId={venueId} formId={form.id} questions={form.questions} onChange={(questions) => onChange({ ...form, questions })} />
      )}
      {section === "post" && <Post venueId={venueId} form={form} />}
      {section === "responses" && <FormResponses venueId={venueId} formId={form.id} questions={form.questions} />}
    </div>
  )
}
