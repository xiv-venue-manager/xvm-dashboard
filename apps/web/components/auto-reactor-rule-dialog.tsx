"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ChannelPicker, RolePicker } from "@/components/discord-picker"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import type { AutoReactorRuleRow } from "@/lib/api/xvm-api"

interface AutoReactorRuleDialogProps {
  venueId: string
  rule: AutoReactorRuleRow | null
  onSaved: (rule: AutoReactorRuleRow, created: boolean) => void
  onClose: () => void
}

function ClearButton({ label, onClick, visible }: { label: string; onClick: () => void; visible: boolean }) {
  if (!visible) return null
  return (
    <button type="button" onClick={onClick} className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]">
      {label}
    </button>
  )
}

export function AutoReactorRuleDialog({ venueId, rule, onSaved, onClose }: AutoReactorRuleDialogProps) {
  const [emoji, setEmoji] = useState(rule?.emoji ?? "")
  const [channelId, setChannelId] = useState(rule?.channel_id ?? "")
  const [keyword, setKeyword] = useState(rule?.keyword ?? "")
  const [roleId, setRoleId] = useState(rule?.role_id ?? "")
  const [submitting, setSubmitting] = useState(false)

  const isDraft = channelId === "" && keyword.trim() === "" && roleId === ""

  async function submit() {
    if (emoji.trim() === "") {
      toast.error("Choose an emoji for the reaction.")
      return
    }
    if (channelId !== "" && !SNOWFLAKE_PATTERN.test(channelId)) {
      toast.error("Channel ID must be numeric.")
      return
    }
    if (roleId !== "" && !SNOWFLAKE_PATTERN.test(roleId)) {
      toast.error("Role ID must be numeric.")
      return
    }

    setSubmitting(true)
    try {
      const body = {
        emoji: emoji.trim(),
        channelId: channelId || null,
        keyword: keyword.trim() || null,
        roleId: roleId || null,
      }
      const saved = await apiFetch<AutoReactorRuleRow>(
        rule ? `/api/venues/${venueId}/auto-reactor/rules/${rule.id}` : `/api/venues/${venueId}/auto-reactor/rules`,
        {
          method: rule ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )
      toast.success(rule ? "Rule saved." : "Rule added.")
      onSaved(saved, rule === null)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message.replace(/^Value error, /, "") : "Failed to save the rule.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "New rule"}</DialogTitle>
          <DialogDescription>
            The bot adds this reaction to a message when it matches every condition you set. Leave a condition empty to
            match anything.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="reactor-emoji">Emoji</Label>
            <Input
              id="reactor-emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={100}
              placeholder="👍"
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              A Unicode emoji, a custom emoji as &lt;:name:id&gt;, or a standard shortcode such as :frog:. A server
              emoji&apos;s plain :name: is not accepted.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Channel</Label>
              <ClearButton label="Any channel" visible={channelId !== ""} onClick={() => setChannelId("")} />
            </div>
            <ChannelPicker venueId={venueId} value={channelId} onChange={setChannelId} disabled={submitting} />
            <p className="text-xs text-muted-foreground">
              Matches that channel exactly. A message in a thread does not count as its parent channel&apos;s.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reactor-keyword">Keyword</Label>
            <Input
              id="reactor-keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              maxLength={100}
              placeholder="gg"
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              Whole words or phrases, ignoring case. &quot;gg&quot; matches &quot;GG!&quot; but not &quot;egg&quot;.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Author has role</Label>
              <ClearButton label="Any role" visible={roleId !== ""} onClick={() => setRoleId("")} />
            </div>
            <RolePicker venueId={venueId} value={roleId} onChange={setRoleId} disabled={submitting} />
          </div>

          {isDraft && (
            <p className="text-xs text-amber-400">
              With no condition set this rule is a draft. It is saved, but the bot never reacts for it.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
