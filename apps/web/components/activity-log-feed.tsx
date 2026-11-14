"use client"

import { useRef, useState } from "react"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import {
  ACTIVITY_MODULES,
  ACTIVITY_MODULE_LABELS,
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_SOURCE_LABELS,
  appendOlder,
  dayEndIso,
  dayStartIso,
  hasMoreActivity,
  isApplicableDay,
  oldestCreatedAt,
} from "@/lib/activity-log"
import { useMounted } from "@/lib/use-mounted"
import type { ActivityRow } from "@/lib/api/xvm-api"

const ANY = "any"

interface Filters {
  module: string
  person: string
  from: string
  to: string
}

export interface ActivityLogFeedProps {
  venueId: string
  people: { id: number; name: string }[]
  rows: ActivityRow[]
  loadFailed: boolean
}

function describe(row: ActivityRow): string {
  if (row.summary) return row.summary
  const target = row.target_label ?? row.target_type
  return target ? `${row.action} ${target}` : row.action
}

export function ActivityLogFeed({ venueId, people, rows: initialRows, loadFailed }: ActivityLogFeedProps) {
  const [rows, setRows] = useState(initialRows)
  const [more, setMore] = useState(hasMoreActivity(initialRows.length))
  const [filters, setFilters] = useState<Filters>({ module: ANY, person: ANY, from: "", to: "" })
  const [loading, setLoading] = useState(false)
  const latest = useRef(0)
  const mounted = useMounted()

  function queryFor(next: Filters, before: string | null) {
    const toIso = before ?? (next.to !== "" ? dayEndIso(next.to) : undefined)
    return {
      limit: ACTIVITY_PAGE_SIZE,
      ...(next.module !== ANY && { module: next.module }),
      ...(next.person !== ANY && { actorPersonId: Number(next.person) }),
      ...(next.from !== "" && { from: dayStartIso(next.from) }),
      ...(toIso !== undefined && { to: toIso }),
    }
  }

  async function fetchPage(next: Filters, before: string | null): Promise<ActivityRow[] | null> {
    const request = ++latest.current
    setLoading(true)
    try {
      const page = await apiRoute<ActivityRow[]>("/api/venues/[venueId]/activity", {
        params: { venueId },
        query: queryFor(next, before),
      })
      return request === latest.current ? page : null
    } catch (e) {
      if (request === latest.current) toast.error(e instanceof ApiError ? e.message : "Failed to load the activity log.")
      return null
    } finally {
      if (request === latest.current) setLoading(false)
    }
  }

  async function applyFilters(next: Filters) {
    const previous = filters
    setFilters(next)
    const request = latest.current + 1
    const page = await fetchPage(next, null)
    if (page === null) {
      if (latest.current === request) setFilters(previous)
      return
    }
    setRows(page)
    setMore(hasMoreActivity(page.length))
  }

  async function loadOlder() {
    const before = oldestCreatedAt(rows)
    if (before === null) return
    const page = await fetchPage(filters, before)
    if (page === null) return
    setRows((prev) => appendOlder(prev, page))
    setMore(hasMoreActivity(page.length))
  }

  function changeDay(key: "from" | "to", value: string) {
    const next = { ...filters, [key]: value }
    if (!isApplicableDay(value)) {
      setFilters(next)
      return
    }
    applyFilters(next)
  }

  const filtered = filters.module !== ANY || filters.person !== ANY || filters.from !== "" || filters.to !== ""

  if (loadFailed) {
    return <p className="text-sm text-muted-foreground">Couldn&apos;t load the activity log. Try reloading the page.</p>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="activity-module">Part of the app</Label>
            <Select value={filters.module} onValueChange={(module) => applyFilters({ ...filters, module })}>
              <SelectTrigger id="activity-module">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Everything</SelectItem>
                {ACTIVITY_MODULES.map((module) => (
                  <SelectItem key={module} value={module}>
                    {ACTIVITY_MODULE_LABELS[module]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="activity-person">Who</Label>
            <Select value={filters.person} onValueChange={(person) => applyFilters({ ...filters, person })}>
              <SelectTrigger id="activity-person">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Anyone</SelectItem>
                {people.map((person) => (
                  <SelectItem key={person.id} value={String(person.id)}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="activity-from">From</Label>
            <Input
              id="activity-from"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => changeDay("from", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="activity-to">To</Label>
            <Input
              id="activity-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => changeDay("to", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{loading ? "Loading..." : filtered ? "Nothing matches these filters." : "No activity yet."}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-[12rem] flex-1 space-y-1">
                  <p className="text-sm">{describe(row)}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{row.actor_name ?? "Automatic"}</span>
                    <Badge variant="tag">{ACTIVITY_MODULE_LABELS[row.module as keyof typeof ACTIVITY_MODULE_LABELS] ?? row.module}</Badge>
                    <Badge variant="tag">{ACTIVITY_SOURCE_LABELS[row.source] ?? row.source}</Badge>
                  </div>
                </div>
                {mounted && (
                  <span className="text-xs text-muted-foreground">{format(new Date(row.created_at), "PP p")}</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {more && (
        <Button variant="outline" onClick={loadOlder} disabled={loading}>
          {loading ? "Loading..." : "Load older activity"}
        </Button>
      )}

      <p className="text-xs text-muted-foreground">Activity is kept for 90 days.</p>
    </div>
  )
}
