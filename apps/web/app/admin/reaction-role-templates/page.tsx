"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PageLoading } from "@/components/ui/loading-spinner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Layers, Plus, Trash2 } from "lucide-react"
import {
  MAX_TEMPLATE_DESCRIPTION,
  MAX_TEMPLATE_EMOJI,
  MAX_TEMPLATE_NAME,
  MAX_TEMPLATE_OPTIONS,
  MAX_TEMPLATE_ROLE_NAME,
  MAX_TEMPLATE_TITLE,
} from "@/lib/api/reaction-role-template-limits"
import type { ReactionRoleMessageType, TemplateOptionRow, TemplateRow } from "@/lib/api/xvm-api"

const MESSAGE_TYPES: { value: ReactionRoleMessageType; label: string }[] = [
  { value: "normal", label: "Normal — toggles the role" },
  { value: "unique", label: "Unique — one role at a time" },
  { value: "verify", label: "Verify — grants, never removes" },
]

const BASE = "/api/admin/reaction-role-templates"

type TemplateField = "name" | "title" | "description" | "message_type"
type OptionField = "name" | "color" | "emoji"

const toHex = (color: number) => `#${color.toString(16).padStart(6, "0")}`
const toInt = (hex: string) => parseInt(hex.replace("#", ""), 16)

const emptyTemplate = { name: "", title: "", description: "", message_type: "normal" as ReactionRoleMessageType }
const emptyOption = { name: "", color: "#8891a0", emoji: "" }

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  })
  if (res.ok) return
  const data = await res.json().catch(() => null)
  throw new Error(data?.message ?? data?.error ?? `Request failed (${res.status})`)
}

export default function AdminReactionRoleTemplatesPage() {
  const { status } = useSession()
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(emptyTemplate)
  const [newOption, setNewOption] = useState<Record<number, typeof emptyOption>>({})

  // Nothing before the first await may set state: the effect below calls this
  // synchronously, and react-hooks flags a setState reachable on that path.
  const load = useCallback(async () => {
    try {
      const res = await fetch(BASE)
      if (res.status === 403) {
        setForbidden(true)
        setError(null)
        return
      }
      if (!res.ok) throw new Error(`Couldn't load templates (${res.status})`)
      setTemplates(await res.json())
      setForbidden(false)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load templates")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === "authenticated") {
      // Genuine data fetch (sets templates/forbidden/loading state), not derivable from props/state during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load()
    }
  }, [status, load])

  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      return false
    } finally {
      setBusy(false)
    }
  }

  const optionDraft = (templateId: number) => newOption[templateId] ?? emptyOption
  const setOptionDraft = (templateId: number, value: typeof emptyOption) =>
    setNewOption((prev) => ({ ...prev, [templateId]: value }))

  if (status === "unauthenticated") {
    return (
      <div className="page-inner">
        <Alert>
          <AlertDescription>Sign in to manage reaction role templates.</AlertDescription>
        </Alert>
      </div>
    )
  }

  // `loading` only covers the fetch, so the unauthenticated branch above returns
  // before it is consulted - no effect needs to clear it.
  if (status === "loading" || loading) return <PageLoading text="Loading templates…" />


  if (forbidden) {
    return (
      <div className="page-inner">
        <Alert>
          <AlertDescription>
            This page is for platform admins. If you are one, your xvm-api link may not carry the
            platform_admin scope yet — reconnect it from Settings, or ask for the scope to be granted.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="page-inner max-w-3xl">
      <div className="mb-6 flex items-center gap-2">
        <Layers className="h-5 w-5 text-[var(--xiv-blue)]" />
        <h1 className="page-h1">Reaction Role Templates</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        The shared catalog every venue picks from under Reaction Roles. Platform-wide, not per venue.
      </p>

      {error && (
        <Alert className="mb-4 bg-destructive/10 border-destructive/20">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            busy={busy}
            optionDraft={optionDraft(template.id)}
            onOptionDraftChange={(value) => setOptionDraft(template.id, value)}
            onSave={(data) => run(() => send(`${BASE}/${template.id}`, "PATCH", data))}
            onDelete={() => run(() => send(`${BASE}/${template.id}`, "DELETE"))}
            onAddOption={(data) =>
              run(async () => {
                await send(`${BASE}/${template.id}/options`, "POST", data)
                setOptionDraft(template.id, emptyOption)
              })
            }
            onSaveOption={(option, data) =>
              run(() => send(`${BASE}/${template.id}/options/${option.id}`, "PATCH", data))
            }
            onDeleteOption={(option) =>
              run(() => send(`${BASE}/${template.id}/options/${option.id}`, "DELETE"))
            }
          />
        ))}

        {templates.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--blue-015)] p-6 text-center text-sm text-muted-foreground">
            No templates yet.
          </div>
        )}
      </div>

      <div className="panel mt-6 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">New template</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-name">Name (picker label)</Label>
            <Input
              id="new-name"
              value={draft.name}
              maxLength={MAX_TEMPLATE_NAME}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-title">Panel title</Label>
            <Input
              id="new-title"
              value={draft.title}
              maxLength={MAX_TEMPLATE_TITLE}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <Label htmlFor="new-description">Description</Label>
          <Input
            id="new-description"
            value={draft.description}
            maxLength={MAX_TEMPLATE_DESCRIPTION}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Message type</Label>
            <Select
              value={draft.message_type}
              onValueChange={(value) => setDraft({ ...draft, message_type: value as ReactionRoleMessageType })}
            >
              <SelectTrigger className="w-[20rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESSAGE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={busy || !draft.name.trim() || !draft.title.trim()}
            onClick={() =>
              run(async () => {
                await send(BASE, "POST", {
                  name: draft.name.trim(),
                  title: draft.title.trim(),
                  description: draft.description.trim() || null,
                  message_type: draft.message_type,
                })
                setDraft(emptyTemplate)
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" />
            Create template
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Add roles after creating the template.</p>
      </div>
    </div>
  )
}

function TemplateCard({
  template,
  busy,
  optionDraft,
  onOptionDraftChange,
  onSave,
  onDelete,
  onAddOption,
  onSaveOption,
  onDeleteOption,
}: {
  template: TemplateRow
  busy: boolean
  optionDraft: typeof emptyOption
  onOptionDraftChange: (value: typeof emptyOption) => void
  onSave: (data: Record<string, unknown>) => Promise<boolean>
  onDelete: () => void
  onAddOption: (data: Record<string, unknown>) => void
  onSaveOption: (option: TemplateOptionRow, data: Record<string, unknown>) => Promise<boolean>
  onDeleteOption: (option: TemplateOptionRow) => void
}) {
  // Only the fields this admin typed into. Anything untouched renders straight
  // from the prop, so a reload showing another admin's edit is displayed rather
  // than shadowed - and the save below can never carry a value nobody here set.
  // Diffing local state against the prop does not work: the prop refreshes on
  // every reload while the local copy does not, so an untouched field reads as
  // changed and overwrites the newer value.
  const [edits, setEdits] = useState<Partial<Record<TemplateField, string>>>({})

  const live: Record<TemplateField, string> = {
    name: template.name,
    title: template.title,
    description: template.description ?? "",
    message_type: template.message_type,
  }

  const valueOf = (field: TemplateField) => edits[field] ?? live[field]
  const setField = (field: TemplateField, value: string) => setEdits((prev) => ({ ...prev, [field]: value }))

  const patch = () =>
    Object.fromEntries(
      (Object.keys(edits) as TemplateField[]).map((field) =>
        field === "description"
          ? ["description", valueOf(field).trim() || null]
          : [field, field === "message_type" ? valueOf(field) : valueOf(field).trim()]
      )
    )

  const dirty = Object.keys(edits).length > 0
  const atCap = template.options.length >= MAX_TEMPLATE_OPTIONS

  return (
    <div className="panel p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Name (picker label)</Label>
          <Input value={valueOf("name")} maxLength={MAX_TEMPLATE_NAME} onChange={(e) => setField("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Panel title</Label>
          <Input value={valueOf("title")} maxLength={MAX_TEMPLATE_TITLE} onChange={(e) => setField("title", e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <Label>Description</Label>
        <Input
          value={valueOf("description")}
          maxLength={MAX_TEMPLATE_DESCRIPTION}
          onChange={(e) => setField("description", e.target.value)}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Message type</Label>
          <Select
            value={valueOf("message_type")}
            onValueChange={(value) => setField("message_type", value)}
          >
            <SelectTrigger className="w-[20rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESSAGE_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !dirty || !valueOf("name").trim() || !valueOf("title").trim()}
          onClick={() => void onSave(patch()).then((ok) => ok && setEdits({}))}
        >
          Save
        </Button>
        <div className="ml-auto">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={busy}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{template.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the template and its roles from the catalog. Panels venues already created from
                  it are unaffected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="mt-4 border-t border-[var(--blue-015)] pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Roles ({template.options.length}/{MAX_TEMPLATE_OPTIONS})
        </div>

        <div className="flex flex-col gap-2">
          {template.options.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              busy={busy}
              onSave={(data) => onSaveOption(option, data)}
              onDelete={() => onDeleteOption(option)}
            />
          ))}

          {template.options.length === 0 && (
            <div className="rounded-lg border border-dashed border-[var(--blue-015)] p-3 text-center text-xs text-muted-foreground">
              No roles yet — a panel made from this template would be empty.
            </div>
          )}
        </div>

        {!atCap && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="color"
              aria-label="Role colour"
              value={optionDraft.color}
              onChange={(e) => onOptionDraftChange({ ...optionDraft, color: e.target.value })}
              className="h-9 w-10 flex-none cursor-pointer rounded border border-[var(--blue-015)] bg-transparent"
            />
            <Input
              placeholder="Emoji"
              value={optionDraft.emoji}
              maxLength={MAX_TEMPLATE_EMOJI}
              onChange={(e) => onOptionDraftChange({ ...optionDraft, emoji: e.target.value })}
              className="w-24"
            />
            <Input
              placeholder="Role name"
              value={optionDraft.name}
              maxLength={MAX_TEMPLATE_ROLE_NAME}
              onChange={(e) => onOptionDraftChange({ ...optionDraft, name: e.target.value })}
              className="min-w-[10rem] flex-1"
            />
            <Button
              size="sm"
              disabled={busy || !optionDraft.name.trim()}
              onClick={() =>
                onAddOption({
                  name: optionDraft.name.trim(),
                  color: toInt(optionDraft.color),
                  emoji: optionDraft.emoji.trim() || null,
                })
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              Add role
            </Button>
          </div>
        )}

        {atCap && (
          <p className="mt-3 text-xs text-muted-foreground">
            At the {MAX_TEMPLATE_OPTIONS}-role cap. Remove one to add another.
          </p>
        )}
      </div>
    </div>
  )
}

function OptionRow({
  option,
  busy,
  onSave,
  onDelete,
}: {
  option: TemplateOptionRow
  busy: boolean
  onSave: (data: Record<string, unknown>) => Promise<boolean>
  onDelete: () => void
}) {
  // Touched-only, same reasoning as the template card.
  const [edits, setEdits] = useState<Partial<Record<OptionField, string>>>({})

  const live: Record<OptionField, string> = {
    name: option.name,
    color: toHex(option.color),
    emoji: option.emoji ?? "",
  }

  const valueOf = (field: OptionField) => edits[field] ?? live[field]
  const setField = (field: OptionField, value: string) => setEdits((prev) => ({ ...prev, [field]: value }))

  const patch = () =>
    Object.fromEntries(
      (Object.keys(edits) as OptionField[]).map((field) =>
        field === "color"
          ? ["color", toInt(valueOf("color"))]
          : field === "emoji"
            ? ["emoji", valueOf("emoji").trim() || null]
            : ["name", valueOf("name").trim()]
      )
    )

  const dirty = Object.keys(edits).length > 0

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--blue-015)] bg-[var(--card)] p-2.5">
      <input
        type="color"
        aria-label={`Colour for ${option.name}`}
        value={valueOf("color")}
        onChange={(e) => setField("color", e.target.value)}
        className="h-9 w-10 flex-none cursor-pointer rounded border border-[var(--blue-015)] bg-transparent"
      />
      <Input
        aria-label={`Emoji for ${option.name}`}
        value={valueOf("emoji")}
        maxLength={MAX_TEMPLATE_EMOJI}
        onChange={(e) => setField("emoji", e.target.value)}
        className="w-24"
      />
      <Input
        aria-label={`Name for ${option.name}`}
        value={valueOf("name")}
        maxLength={MAX_TEMPLATE_ROLE_NAME}
        onChange={(e) => setField("name", e.target.value)}
        className="min-w-[10rem] flex-1"
      />
      <Button
        variant="outline"
        size="sm"
        disabled={busy || !dirty || !valueOf("name").trim()}
        onClick={() => void onSave(patch()).then((ok) => ok && setEdits({}))}
      >
        Save
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
