"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { AutoReactorRuleDialog } from "@/components/auto-reactor-rule-dialog"
import { useDiscordOptions } from "@/components/discord-picker"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import { customEmojiUrl, emojiLabel, parseCustomEmoji } from "@/lib/discord-emoji"
import type { AutoReactorRuleRow, ModuleRow } from "@/lib/api/xvm-api"

const MAX_RULES = 50

export interface AutoReactorBoardProps {
  venueId: string
  canManage: boolean
  rules: AutoReactorRuleRow[]
  enabled: boolean
}

function isDraft(rule: AutoReactorRuleRow): boolean {
  return rule.channel_id === null && rule.keyword === null && rule.role_id === null
}

function EmojiGlyph({ emoji }: { emoji: string }) {
  const custom = parseCustomEmoji(emoji)
  if (!custom) return <span className="text-2xl leading-none">{emoji}</span>
  return (
    <Avatar className="h-8 w-auto min-w-8 rounded-none">
      <AvatarImage src={customEmojiUrl(custom)} alt={emojiLabel(emoji)} />
      <AvatarFallback className="whitespace-nowrap rounded-none bg-transparent px-1 text-[10px] text-muted-foreground">
        {emojiLabel(emoji)}
      </AvatarFallback>
    </Avatar>
  )
}

export function AutoReactorBoard({ venueId, canManage, rules: initialRules, enabled: initialEnabled }: AutoReactorBoardProps) {
  const [rules, setRules] = useState(initialRules)
  const [enabled, setEnabled] = useState(initialEnabled)
  const [switching, setSwitching] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<AutoReactorRuleRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AutoReactorRuleRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const channels = useDiscordOptions(venueId, "channels", canManage && rules.some((r) => r.channel_id !== null))
  const roles = useDiscordOptions(venueId, "roles", canManage && rules.some((r) => r.role_id !== null))
  const channelName = (id: string) => channels.options.find((o) => o.value === id)?.label ?? id
  const roleName = (id: string) => `@${roles.options.find((o) => o.value === id)?.label ?? id}`

  async function toggle(next: boolean) {
    setSwitching(true)
    try {
      const row = await apiFetch<ModuleRow>(`/api/venues/${venueId}/auto-reactor/module`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      })
      setEnabled(row.enabled)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to change the Auto-Reactor.")
    } finally {
      setSwitching(false)
    }
  }

  function handleSaved(rule: AutoReactorRuleRow, created: boolean) {
    setRules((prev) => (created ? [...prev, rule] : prev.map((r) => (r.id === rule.id ? rule : r))))
    setAdding(false)
    setEditing(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch(`/api/venues/${venueId}/auto-reactor/rules/${deleteTarget.id}`, { method: "DELETE" })
      setRules((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      toast.success("Rule removed.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove the rule.")
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="font-semibold">Auto-Reactor</p>
            <p className="text-sm text-muted-foreground">
              {enabled
                ? "On. The bot adds a reaction to any message that matches a rule below."
                : "Off. The bot does not react to anything until this is on."}
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={toggle}
            disabled={!canManage || switching}
            aria-label="Turn the Auto-Reactor on or off"
          />
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {rules.length} of {MAX_RULES} rules. A rule with no condition is a draft and never reacts.
          </p>
          {canManage && (
            <Button size="sm" onClick={() => setAdding(true)} disabled={rules.length >= MAX_RULES}>
              Add rule
            </Button>
          )}
        </div>

        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules yet.</p>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <Card key={rule.id}>
                <CardContent className="flex flex-wrap items-center gap-4 p-5 sm:flex-nowrap">
                  <span className="flex w-16 shrink-0 justify-center">
                    <EmojiGlyph emoji={rule.emoji} />
                  </span>
                  <div className="flex min-w-[10rem] flex-1 flex-wrap items-center gap-2 [&>*]:max-w-full [&>*]:whitespace-normal">
                    {isDraft(rule) ? (
                      <Badge variant="status-soon">Draft: add a channel, keyword or role to make it react</Badge>
                    ) : (
                      <>
                        {rule.channel_id !== null && <Badge variant="tag">In {channelName(rule.channel_id)}</Badge>}
                        {rule.keyword !== null && <Badge variant="tag">Contains &ldquo;{rule.keyword}&rdquo;</Badge>}
                        {rule.role_id !== null && <Badge variant="tag">Author has {roleName(rule.role_id)}</Badge>}
                      </>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline-blue" onClick={() => setEditing(rule)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(rule)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Keywords match whole words or phrases, ignoring case. Channels match exactly, and a message in a thread does not
        count as its parent channel&apos;s. The bot needs View Channel, Read Message History and Add Reactions in each
        rule&apos;s channel.
      </p>

      {(adding || editing) && (
        <AutoReactorRuleDialog
          key={editing?.id ?? "new"}
          venueId={venueId}
          rule={editing}
          onSaved={handleSaved}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              The bot stops adding {deleteTarget ? emojiLabel(deleteTarget.emoji) : "its reaction"} for it. Reactions already added stay on their messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
