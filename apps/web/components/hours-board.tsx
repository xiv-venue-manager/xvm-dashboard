"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import type { HoursCreate, HoursRow } from "@/lib/api/xvm-api"

const NOT_CONNECTED_MESSAGE = "Ask the venue owner to connect this venue to xvm-api first."

const FFXIVVENUES_SOURCE = "ffxivvenues"

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const WEEK_OF_MONTH_NAMES: Record<number, string> = { "-1": "last", "1": "1st", "2": "2nd", "3": "3rd", "4": "4th", "5": "5th" }

async function describeError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}))
  if (body?.error === "not_connected") return NOT_CONNECTED_MESSAGE
  return body?.error || body?.detail || fallback
}

function formatTime(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60)
  const m = minuteOfDay % 60
  const period = h < 12 ? "AM" : "PM"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

function describeRule(row: HoursRow): string {
  const { rule } = row
  const time = `${formatTime(rule.start_minute_of_day)} for ${rule.duration_minutes}m`

  switch (rule.interval) {
    case "weekly":
      return `Every ${WEEKDAY_NAMES[rule.weekday ?? 0]}, ${time}`
    case "biweekly":
      return `Every other ${WEEKDAY_NAMES[rule.weekday ?? 0]}, ${time}`
    case "monthly_by_date":
      return `Monthly on the ${ordinal(rule.day_of_month ?? 1)}, ${time}`
    case "monthly_by_weekday":
      return `${WEEK_OF_MONTH_NAMES[rule.week_of_month ?? 1] ?? rule.week_of_month} ${WEEKDAY_NAMES[rule.weekday ?? 0]} of the month, ${time}`
    default:
      return time
  }
}

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

// Local date, not UTC - toISOString() is off by a day for anyone west of
// Greenwich in the evening, and for biweekly rules the anchor decides which
// of the two weeks the series lands on, so that slip silently flips parity.
function localDateIso(): string {
  const d = new Date()
  const offsetMs = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10)
}

function makeEmptyDraft(): HoursCreate {
  return {
    label: "",
    interval: "weekly",
    weekday: 0,
    day_of_month: null,
    week_of_month: 1,
    start_minute_of_day: 19 * 60,
    duration_minutes: 180,
    timezone: null,
    anchor_date: localDateIso(),
    ends_on: null,
    ends_after_count: null,
  }
}

export function HoursBoard({
  venueId,
  canManage,
  hours,
  notConnected,
  loadFailed,
  venueTimezone,
}: {
  venueId: string
  canManage: boolean
  hours: HoursRow[]
  notConnected?: boolean
  loadFailed?: boolean
  venueTimezone: string
}) {
  const [localHours, setLocalHours] = useState(hours)
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<HoursRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [draft, setDraft] = useState<HoursCreate>(makeEmptyDraft)

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null)
        setSuccess(null)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [error, success])

  async function toggleEnabled(row: HoursRow) {
    if (pendingIds.has(row.id)) return
    setPendingIds((prev) => new Set(prev).add(row.id))
    const nextEnabled = !row.rule.enabled
    setLocalHours((prev) =>
      prev.map((h) => (h.id === row.id ? { ...h, rule: { ...h.rule, enabled: nextEnabled } } : h))
    )
    try {
      const res = await fetch(`/api/venues/${venueId}/hours/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      })
      if (!res.ok) {
        setLocalHours((prev) =>
          prev.map((h) => (h.id === row.id ? { ...h, rule: { ...h.rule, enabled: row.rule.enabled } } : h))
        )
        setError(await describeError(res, "Failed to update entry"))
        return
      }
    } catch {
      setLocalHours((prev) =>
        prev.map((h) => (h.id === row.id ? { ...h, rule: { ...h.rule, enabled: row.rule.enabled } } : h))
      )
      setError("Failed to update entry")
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
    }
  }

  async function confirmDelete() {
    const target = deleteTarget
    setDeleteTarget(null)
    if (!target) return
    setPendingIds((prev) => new Set(prev).add(target.id))
    try {
      const res = await fetch(`/api/venues/${venueId}/hours/${target.id}`, { method: "DELETE" })
      if (!res.ok && res.status !== 204) {
        setError(await describeError(res, "Failed to delete entry"))
        return
      }
      setLocalHours((prev) => prev.filter((h) => h.id !== target.id))
      setSuccess("Entry deleted")
    } catch {
      setError("Failed to delete entry")
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(target.id)
        return next
      })
    }
  }

  async function addEntry() {
    if (adding) return
    setAdding(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/hours`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          label: draft.label?.trim() || null,
          weekday: ["weekly", "biweekly", "monthly_by_weekday"].includes(draft.interval) ? draft.weekday : null,
          day_of_month: draft.interval === "monthly_by_date" ? draft.day_of_month : null,
          week_of_month: draft.interval === "monthly_by_weekday" ? draft.week_of_month : null,
        }),
      })
      if (!res.ok) {
        setError(await describeError(res, "Failed to add entry"))
        return
      }
      const created: HoursRow = await res.json()
      setLocalHours((prev) => [...prev, created])
      setDraft(makeEmptyDraft())
      setShowAddForm(false)
      setSuccess("Entry added")
    } catch {
      setError("Failed to add entry")
    } finally {
      setAdding(false)
    }
  }

  if (notConnected) {
    return (
      <Alert>
        <AlertDescription>{NOT_CONNECTED_MESSAGE}</AlertDescription>
      </Alert>
    )
  }

  if (loadFailed) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Couldn&apos;t load hours right now. Try refreshing the page.</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="xiv-card rounded-2xl divide-y divide-border">
        {localHours.length === 0 ? (
          <p className="text-muted-foreground text-sm p-6 text-center">No hours set yet.</p>
        ) : (
          localHours.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="font-medium truncate">{row.label || describeRule(row)}</p>
                {row.label && <p className="text-muted-foreground text-sm truncate">{describeRule(row)}</p>}
                {row.source === FFXIVVENUES_SOURCE && (
                  <p className="text-muted-foreground text-xs">Synced from FFXIV Venues, read only</p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {canManage && row.source !== FFXIVVENUES_SOURCE ? (
                  <>
                    <Switch
                      checked={row.rule.enabled}
                      disabled={pendingIds.has(row.id)}
                      onCheckedChange={() => toggleEnabled(row)}
                    />
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row)}>
                      Delete
                    </Button>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">{row.rule.enabled ? "Active" : "Paused"}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {canManage && (
        <div className="xiv-card rounded-2xl p-4">
          {!showAddForm ? (
            <Button
              onClick={() => {
                setDraft(makeEmptyDraft())
                setShowAddForm(true)
              }}
            >
              Add Hours Entry
            </Button>
          ) : (
            <div className="space-y-3">
              <Input
                placeholder="Label (optional)"
                value={draft.label ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              />

              <Select value={draft.interval} onValueChange={(v) => setDraft((d) => ({ ...d, interval: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Every other week</SelectItem>
                  <SelectItem value="monthly_by_date">Monthly, on a date</SelectItem>
                  <SelectItem value="monthly_by_weekday">Monthly, on a weekday</SelectItem>
                </SelectContent>
              </Select>

              {(draft.interval === "weekly" || draft.interval === "biweekly" || draft.interval === "monthly_by_weekday") && (
                <Select
                  value={String(draft.weekday ?? 0)}
                  onValueChange={(v) => setDraft((d) => ({ ...d, weekday: Number(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {draft.interval === "monthly_by_date" && (
                <Input
                  type="number"
                  min={1}
                  max={31}
                  placeholder="Day of month"
                  value={draft.day_of_month ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, day_of_month: Number(e.target.value) || null }))}
                />
              )}

              {draft.interval === "monthly_by_weekday" && (
                <Select
                  value={String(draft.week_of_month ?? 1)}
                  onValueChange={(v) => setDraft((d) => ({ ...d, week_of_month: Number(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, -1].map((w) => (
                      <SelectItem key={w} value={String(w)}>
                        {WEEK_OF_MONTH_NAMES[w]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="flex gap-3">
                <Input
                  type="time"
                  value={formatTimeInputValue(draft.start_minute_of_day)}
                  onChange={(e) => setDraft((d) => ({ ...d, start_minute_of_day: parseTimeInputValue(e.target.value) }))}
                />
                <Input
                  type="number"
                  min={1}
                  placeholder="Duration (minutes)"
                  value={draft.duration_minutes}
                  onChange={(e) => setDraft((d) => ({ ...d, duration_minutes: Number(e.target.value) || 0 }))}
                />
              </div>

              <Input
                type="date"
                value={draft.anchor_date}
                onChange={(e) => setDraft((d) => ({ ...d, anchor_date: e.target.value }))}
              />

              <p className="text-muted-foreground text-xs">
                Anchor date: the first date this pattern applies from. For &quot;every other week&quot;, it also
                decides which week the series lands on.
              </p>

              <p className="text-muted-foreground text-xs">
                Timezone defaults to the venue&apos;s own ({venueTimezone}).
              </p>

              <div className="flex gap-2">
                <Button onClick={addEntry} disabled={adding}>
                  {adding ? "Adding…" : "Add Entry"}
                </Button>
                <Button variant="ghost" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleteTarget?.label ?? "this entry"}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function formatTimeInputValue(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60)
  const m = minuteOfDay % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function parseTimeInputValue(value: string): number {
  const [h, m] = value.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}
