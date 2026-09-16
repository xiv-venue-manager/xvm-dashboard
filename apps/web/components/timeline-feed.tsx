"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { formatServerTime } from "@/lib/server-time"
import { formatLocalTime, LocalTime } from "@/components/server-time"
import { Button } from "@/components/ui/button"

type TimelineFilter = "all" | "sales" | "patrons" | "staff"

interface TimelineItem {
  id: string
  type: "sale" | "patron_enter" | "patron_exit" | "shift_start" | "shift_end"
  timestamp: string
  data: Record<string, any>
}

interface TimelineFeedProps {
  venueId: string
  initialFilter?: TimelineFilter
}

const filterLabels: Record<TimelineFilter, string> = {
  all: "All",
  sales: "Sales",
  patrons: "Patrons",
  staff: "Staff",
}

function matchesFilter(item: TimelineItem, filter: TimelineFilter): boolean {
  if (filter === "all") return true
  if (filter === "sales") return item.type === "sale"
  if (filter === "patrons") return item.type === "patron_enter" || item.type === "patron_exit"
  if (filter === "staff") return item.type === "shift_start" || item.type === "shift_end"
  return true
}

export function TimelineFeed({ venueId, initialFilter = "all" }: TimelineFeedProps) {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [filter, setFilter] = useState<TimelineFilter>(initialFilter)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [liveCount, setLiveCount] = useState(0)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const filterRef = useRef(filter)
  filterRef.current = filter

  const fetchItems = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams({ limit: "50" })
      if (filter !== "all") params.set("type", filter)
      if (cursor) params.set("cursor", cursor)

      const res = await fetch("/api/venues/" + venueId + "/timeline?" + params)
      if (!res.ok) return null
      return res.json()
    },
    [venueId, filter]
  )

  useEffect(() => {
    setLoading(true)
    setLiveCount(0)
    fetchItems().then((data) => {
      if (data) {
        setItems(data.items)
        setNextCursor(data.nextCursor)
        setHasMore(data.hasMore)
      }
      setLoading(false)
    })
  }, [fetchItems])

  // SSE subscription
  useEffect(() => {
    const eventSource = new EventSource("/api/stream/" + venueId)

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        if (event.type === "connected") return

        const item: TimelineItem = {
          id: event.id,
          type: event.type,
          timestamp: event.timestamp,
          data: event.data,
        }

        setItems((prev) => [item, ...prev])
        if (matchesFilter(item, filterRef.current)) {
          setLiveCount((c) => c + 1)
        }
      } catch {}
    }

    eventSource.onerror = () => {
      // EventSource auto-reconnects
    }

    return () => eventSource.close()
  }, [venueId])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    const data = await fetchItems(nextCursor)
    if (data) {
      setItems((prev) => [...prev, ...data.items])
      setNextCursor(data.nextCursor)
      setHasMore(data.hasMore)
    }
    setLoadingMore(false)
  }

  const visibleItems = items.filter((item) => matchesFilter(item, filter))

  const formatDay = mounted ? formatLocalTime : formatServerTime
  const grouped = visibleItems.reduce<{ day: string; items: TimelineItem[] }[]>((acc, item) => {
    const day = formatDay(item.timestamp, "dayheader")
    const last = acc[acc.length - 1]
    if (last && last.day === day) last.items.push(item)
    else acc.push({ day, items: [item] })
    return acc
  }, [])

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full p-1">
          {(Object.keys(filterLabels) as TimelineFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f)
                setLiveCount(0)
              }}
              className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${
                filter === f
                  ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>
        {liveCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <span className="xiv-live-dot scale-75" />+{liveCount} live
          </span>
        )}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No activity yet.{filter !== "all" ? " Try a different filter." : ""}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] overflow-hidden">
          <div className="py-2">
            {grouped.map(({ day, items: dayItems }) => (
              <div key={day}>
                <div className="tl-day">{day}</div>
                {dayItems.map((item, idx) => (
                  <TimelineRow key={item.id} item={item} isLast={idx === dayItems.length - 1} />
                ))}
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="text-center py-4 border-t border-[var(--blue-008)]">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TimelineRow({ item, isLast }: { item: TimelineItem; isLast: boolean }) {
  const timeEl = <LocalTime date={item.timestamp} formatStr="time" />

  if (item.type === "sale") {
    const { amount, customerName, service, staff } = item.data
    return (
      <div className={`tl-item${isLast ? " last" : ""}`}>
        <div className="tl-time">{timeEl}</div>
        <div className="tl-node em">
          <div className="tl-title">
            <strong>Sale logged</strong>
            {service && <> — {(service as { name: string }).name}</>}{" "}
            <span className="gil">{Number(amount).toLocaleString("en-US")} gil</span>
          </div>
          {(customerName || (staff && (staff as { name?: string }).name)) && (
            <div className="tl-desc">
              {customerName && <>{String(customerName)}</>}
              {staff && (staff as { name?: string }).name && (
                <>
                  {customerName ? " · " : ""}by {(staff as { name: string }).name}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Shift events
  if (item.type === "shift_start" || item.type === "shift_end") {
    const { staffName, roleName } = item.data
    const isStart = item.type === "shift_start"
    return (
      <div className={`tl-item${isLast ? " last" : ""}`}>
        <div className="tl-time">{timeEl}</div>
        <div className="tl-node">
          <div className="tl-title">
            <strong>{String(staffName ?? "Staff")}</strong> {isStart ? "clocked in" : "clocked out"}
            {roleName ? <span className="text-muted-foreground font-normal"> — {String(roleName)}</span> : null}
          </div>
        </div>
      </div>
    )
  }

  const { characterName, world } = item.data
  const isEnter = item.type === "patron_enter"

  return (
    <div className={`tl-item${isLast ? " last" : ""}`}>
      <div className="tl-time">{timeEl}</div>
      <div className={`tl-node${isEnter ? "" : " am"}`}>
        <div className="tl-title">
          <strong>{characterName ? String(characterName) : "Unknown"}</strong>
          {world ? <span className="text-muted-foreground font-normal"> · {String(world)}</span> : null}{" "}
          {isEnter ? "entered the venue" : "left the venue"}
        </div>
      </div>
    </div>
  )
}
