"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { LocalTime } from "@/components/server-time"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { StatReadout } from "@/components/ui/stat-readout"
import { Coins, UserPlus, UserMinus, Users, Clock, StopCircle, Terminal, Radio } from "lucide-react"
import { formatDistanceToNowStrict } from "date-fns"
import { useRouter } from "next/navigation"
import type { TimelineItem } from "@/components/timeline-feed"

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

interface LiveEvent {
  id: string
  title: string
  eventType: string
  startTime: string
  endTime: string
  status: string
}

interface ActivityItem {
  id: string
  type: "sale" | "patron_enter" | "patron_exit" | "shift_start" | "shift_end"
  timestamp: string
  text: string
}

interface PatronRosterItem {
  name: string
  arrivedAt: string
}
interface StaffRosterItem {
  name: string
  role: string
}

interface LiveDashboardProps {
  venueId: string
  event: LiveEvent
  isUpcoming: boolean
  initialPatronCount: number
  initialRevenue: number | null
  initialSaleCount: number
  revenueUnavailable: boolean
  initialNewTonight: number
  showRevenue: boolean
  revenueLabel: string
  patronRoster: PatronRosterItem[]
  onShiftStaff: StaffRosterItem[]
  currentUserId: string
  scopeSalesToOwn: boolean
  canManage: boolean
}

export function LiveDashboard({
  venueId,
  event,
  isUpcoming,
  initialPatronCount,
  initialRevenue,
  initialSaleCount,
  revenueUnavailable,
  initialNewTonight,
  showRevenue,
  revenueLabel,
  patronRoster: initialRoster,
  onShiftStaff,
  currentUserId,
  scopeSalesToOwn,
  canManage,
}: LiveDashboardProps) {
  const router = useRouter()
  const [patronCount, setPatronCount] = useState(initialPatronCount)
  const [revenue, setRevenue] = useState(initialRevenue ?? 0)
  const [saleCount, setSaleCount] = useState(initialSaleCount)
  const [newTonight, setNewTonight] = useState(initialNewTonight)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [elapsed, setElapsed] = useState("")
  const [connected, setConnected] = useState(false)
  const [roster, setRoster] = useState<PatronRosterItem[]>(initialRoster)
  const [ending, setEnding] = useState(false)

  async function handleEndEvent() {
    setEnding(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || `Failed to end event (${res.status})`)
        return
      }
      router.refresh()
    } catch {
      alert("Network error ending event.")
    } finally {
      setEnding(false)
    }
  }

  // Elapsed timer
  useEffect(() => {
    if (isUpcoming) return
    const tick = () => {
      const ms = Date.now() - new Date(event.startTime).getTime()
      setElapsed(formatDuration(Math.max(0, ms)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [event.startTime, isUpcoming])

  // Load historical activity
  useEffect(() => {
    if (isUpcoming || !event.id) return
    fetch(`/api/venues/${venueId}/timeline?eventId=${event.id}&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data.items)) return
        setActivity(
          (data.items as TimelineItem[])
            .filter(
              (
                item
              ): item is Extract<
                TimelineItem,
                { type: "sale" | "patron_enter" | "patron_exit" | "shift_start" | "shift_end" }
              > =>
                item.type === "sale" ||
                item.type === "patron_enter" ||
                item.type === "patron_exit" ||
                item.type === "shift_start" ||
                item.type === "shift_end"
            )
            .map((item) => ({
              id: item.id,
              type: item.type,
              timestamp: item.timestamp,
              text:
                item.type === "sale"
                  ? `${item.data.service?.name ? item.data.service.name + " · " : ""}${item.data.customerName || "Someone"} — ${Number(item.data.amount || 0).toLocaleString()} gil${item.data.staff?.name ? " · " + item.data.staff.name : ""}`
                  : item.type === "patron_enter"
                    ? `${item.data.characterName || "Unknown"} entered`
                    : item.type === "patron_exit"
                      ? `${item.data.characterName || "Unknown"} left`
                      : `${item.data.staffName ?? "Staff"} ${item.type === "shift_start" ? "clocked in" : "clocked out"}`,
            }))
        )
      })
      .catch(() => {})
  }, [venueId, event.id, isUpcoming])

  // SSE
  useEffect(() => {
    const es = new EventSource("/api/stream/" + venueId)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === "connected") {
          setConnected(true)
          return
        }

        if (data.type === "sale") {
          const amt = Number(data.data.amount || 0)
          if (showRevenue && !revenueUnavailable && (!scopeSalesToOwn || data.data.staff?.id === currentUserId)) {
            setRevenue((prev) => prev + amt)
            setSaleCount((prev) => prev + 1)
          }
          setActivity((prev) =>
            prev.some((a) => a.id === data.id)
              ? prev
              : [
                  {
                    id: data.id,
                    type: "sale" as const,
                    timestamp: data.timestamp,
                    text: `${data.data.service?.name ? data.data.service.name + " · " : ""}${data.data.customerName || "Someone"} — ${amt.toLocaleString()} gil${data.data.staff?.name ? " · " + data.data.staff.name : ""}`,
                  },
                  ...prev,
                ].slice(0, 50)
          )
        }
        if (data.type === "patron_enter") {
          setPatronCount((prev) => prev + 1)
          setNewTonight((prev) => prev + 1)
          const name = data.data.characterName || "Unknown"
          setRoster((prev) =>
            [{ name, arrivedAt: data.timestamp }, ...prev.filter((p) => p.name !== name)].slice(0, 20)
          )
          setActivity((prev) =>
            prev.some((a) => a.id === data.id)
              ? prev
              : [
                  {
                    id: data.id,
                    type: "patron_enter" as const,
                    timestamp: data.timestamp,
                    text: `${name} entered`,
                  },
                  ...prev,
                ].slice(0, 50)
          )
        }
        if (data.type === "patron_exit") {
          setPatronCount((prev) => Math.max(0, prev - 1))
          const name = data.data.characterName || "Unknown"
          setRoster((prev) => prev.filter((p) => p.name !== name))
          setActivity((prev) =>
            prev.some((a) => a.id === data.id)
              ? prev
              : [
                  {
                    id: data.id,
                    type: "patron_exit" as const,
                    timestamp: data.timestamp,
                    text: `${name} left`,
                  },
                  ...prev,
                ].slice(0, 50)
          )
        }
        if (data.type === "shift_start" || data.type === "shift_end") {
          const staffName = data.data.staffName ?? "Staff"
          setActivity((prev) =>
            prev.some((a) => a.id === data.id)
              ? prev
              : [
                  {
                    id: data.id,
                    type: data.type as "shift_start" | "shift_end",
                    timestamp: data.timestamp,
                    text: `${staffName} ${data.type === "shift_start" ? "clocked in" : "clocked out"}`,
                  },
                  ...prev,
                ].slice(0, 50)
          )
        }
      } catch {}
    }
    es.onerror = () => setConnected(false)
    return () => es.close()
  }, [venueId, showRevenue, revenueUnavailable, scopeSalesToOwn, currentUserId])

  const fiClass = (type: ActivityItem["type"]) => {
    if (type === "patron_enter")
      return "bg-[var(--success-soft)] border-[rgba(16,185,129,0.25)] text-[var(--success-text)]"
    if (type === "patron_exit") return "bg-[rgba(108,112,134,0.12)] border-[var(--border)] text-[var(--fg-faint)]"
    if (type === "sale") return "bg-[var(--blue-010)] border-[var(--blue-018)] text-[var(--xiv-blue)]"
    if (type === "shift_start" || type === "shift_end")
      return "bg-[rgba(249,226,175,0.08)] border-[rgba(249,226,175,0.25)] text-[var(--warning)]"
    return "bg-[var(--blue-010)] border-[var(--blue-018)] text-[var(--xiv-blue)]"
  }

  return (
    <div className="page-inner" style={{ maxWidth: 1160 }}>
      {/* Session bar — matches prototype .session-bar */}
      <div className="rounded-xl border border-[var(--blue-018)] overflow-hidden relative flex items-center gap-7 flex-wrap px-[26px] py-5 bg-[var(--card)]">
        <div className="absolute inset-0 bg-[url('/starfield.webp')] bg-cover bg-center opacity-[0.18] pointer-events-none" />
        <div className="absolute inset-0 sess-gradient pointer-events-none" />

        {/* Main event info */}
        <div className="relative z-10 flex flex-col gap-2 flex-1 min-w-0">
          <span className={isUpcoming ? "status soon w-fit" : "status open w-fit"}>
            <span className="dot" />
            {isUpcoming ? "Starting soon" : "Live now"}
          </span>
          <div className="font-cinzel font-bold text-[1.45rem] tracking-[0.02em] leading-tight">{event.title}</div>
          <div className="text-[0.84rem] text-muted-foreground flex items-center gap-2">
            <Clock className="w-[14px] h-[14px] text-[var(--xiv-blue)]" />
            Started <LocalTime date={event.startTime} formatStr="time" />
            {!isUpcoming && canManage && (
              <div className="flex gap-2 ml-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="opacity-80 hover:opacity-100"
                      disabled={ending}
                    >
                      <StopCircle className="h-3.5 w-3.5" /> {ending ? "Ending…" : "End"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>End &quot;{event.title}&quot; now?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Marks it Completed and locks in attendance/revenue from what&apos;s logged so far.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleEndEvent}>End event</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </div>

        {/* Timer */}
        {!isUpcoming && elapsed && (
          <div className="relative z-10 text-right flex-shrink-0">
            <div className="text-[0.64rem] uppercase tracking-[0.14em] text-[var(--fg-faint)] font-semibold">
              Session elapsed
            </div>
            <div className="font-[var(--font-jetbrains)] text-[1.9rem] font-semibold tabular-nums mt-1 leading-none">
              {elapsed}
            </div>
          </div>
        )}
      </div>

      {/* Stat grid — matches prototype .stat-grid repeat(5,1fr) */}
      <div className="stat-grid mt-4">
        <Card className="px-[18px] py-4">
          <StatReadout
            label="In venue now"
            value={patronCount}
            icon={<Users />}
            iconVariant={connected ? "success" : "blue"}
          />
        </Card>
        <Card className="px-[18px] py-4">
          <StatReadout label="New tonight" value={newTonight} icon={<UserPlus />} iconVariant="blue" />
        </Card>
        {showRevenue && (
          <Card className="px-[18px] py-4">
            <StatReadout
              label={revenueLabel}
              value={revenueUnavailable ? "—" : `${revenue.toLocaleString()}`}
              subtext={revenueUnavailable ? "unavailable" : "gil"}
              icon={<Coins />}
              iconVariant="success"
            />
          </Card>
        )}
        {showRevenue && (
          <Card className="px-[18px] py-4">
            <StatReadout label="Transactions" value={revenueUnavailable ? "—" : saleCount} icon={<Radio />} iconVariant="blue" />
          </Card>
        )}
        <Card className="px-[18px] py-4">
          <StatReadout label="On shift" value={onShiftStaff.length} icon={<Clock />} iconVariant="warning" />
        </Card>
      </div>

      {/* Live grid: feed (1.65fr) + side (1fr) — matches prototype .live-grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] gap-[18px] mt-[18px] items-start">
        {/* Activity feed — matches prototype .panel .fitem */}
        <section className="panel">
          <div className="ph flex items-center gap-3 px-5 py-4 border-b border-[var(--blue-008)]">
            <span className="pt font-[var(--font-outfit)] font-semibold text-[0.95rem] flex items-center gap-2">
              <Radio className="w-[17px] h-[17px] text-[var(--xiv-blue)]" /> Live activity
            </span>
            <div className="flex-1" />
            <span className="listening flex items-center gap-2 text-[0.74rem] text-[var(--success-text)] font-medium">
              {connected ? (
                <>
                  <span>Listening</span>
                  <div className="flex gap-0.5">
                    <span className="xiv-listening-dot" />
                    <span className="xiv-listening-dot" />
                    <span className="xiv-listening-dot" />
                  </div>
                </>
              ) : (
                "Connecting…"
              )}
            </span>
          </div>

          {activity.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-sm text-muted-foreground">
                {isUpcoming ? "Activity will appear once the event starts." : "Waiting for activity…"}
              </p>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto sidebar-scroll">
              {activity.map((item) => (
                <div
                  key={item.id}
                  className="fitem flex gap-[14px] px-5 py-[13px] items-start border-t border-[var(--blue-008)] first:border-t-0 hover:bg-[var(--blue-004)] transition-colors"
                >
                  <span
                    className={`fi w-[34px] h-[34px] rounded-[var(--radius-sm)] grid place-items-center flex-shrink-0 border ${fiClass(item.type)}`}
                  >
                    {item.type === "patron_enter" ? (
                      <UserPlus className="w-4 h-4" />
                    ) : item.type === "patron_exit" ? (
                      <UserMinus className="w-4 h-4" />
                    ) : item.type === "shift_start" || item.type === "shift_end" ? (
                      <Clock className="w-4 h-4" />
                    ) : (
                      <Coins className="w-4 h-4" />
                    )}
                  </span>
                  <div className="fbody flex-1 min-w-0">
                    <div className="ftext text-[0.88rem] leading-[1.45]">{item.text}</div>
                    <div className="fmeta text-[0.72rem] text-[var(--fg-faint)] mt-1">
                      <LocalTime date={item.timestamp} formatStr="time" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Side column */}
        <div className="live-side flex flex-col gap-[18px]">
          {/* In venue now */}
          <section className="panel">
            <div className="ph flex items-center gap-3 px-5 py-4 border-b border-[var(--blue-008)]">
              <span className="pt font-[var(--font-outfit)] font-semibold text-[0.95rem] flex items-center gap-2">
                <Users className="w-[17px] h-[17px] text-[var(--xiv-blue)]" /> In venue now
              </span>
              <div className="flex-1" />
              <span className="pcount text-[0.74rem] text-[var(--fg-faint)] font-medium">{patronCount} patrons</span>
            </div>
            <div className="py-1.5">
              {roster.length > 0 ? (
                roster.slice(0, 10).map((p, i) => (
                  <div
                    key={i}
                    className="rrow flex items-center gap-3 px-5 py-2.5 border-b border-[var(--blue-008)] last:border-0"
                  >
                    <div className="av w-[30px] h-[30px] rounded-full bg-gradient-to-br from-[#5865F2] to-[var(--xiv-blue)] grid place-items-center text-[0.7rem] font-bold text-white flex-shrink-0">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="rinfo flex-1 min-w-0">
                      <div className="rn text-[0.86rem] font-medium truncate">{p.name}</div>
                      <div className="rt text-[0.72rem] text-[var(--fg-faint)]">
                        {formatDistanceToNowStrict(new Date(p.arrivedAt), { addSuffix: false })}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground px-5 py-4">No patrons yet</p>
              )}
              {roster.length > 10 && (
                <p className="text-xs text-muted-foreground text-center py-2">+{roster.length - 10} more</p>
              )}
            </div>
          </section>

          {/* On shift */}
          <section className="panel">
            <div className="ph flex items-center gap-3 px-5 py-4 border-b border-[var(--blue-008)]">
              <span className="pt font-[var(--font-outfit)] font-semibold text-[0.95rem] flex items-center gap-2">
                <Clock className="w-[17px] h-[17px] text-[var(--xiv-blue)]" /> On shift
              </span>
              <div className="flex-1" />
              <span className="pcount text-[0.74rem] text-[var(--fg-faint)] font-medium">
                {onShiftStaff.length} clocked in
              </span>
            </div>
            <div className="py-1.5">
              {onShiftStaff.length > 0 ? (
                onShiftStaff.map((s, i) => (
                  <div
                    key={i}
                    className="rrow flex items-center gap-3 px-5 py-2.5 border-b border-[var(--blue-008)] last:border-0"
                  >
                    <div className="av w-[30px] h-[30px] rounded-full bg-[var(--blue-010)] border border-[var(--blue-018)] grid place-items-center text-[0.7rem] font-bold text-[var(--xiv-blue)] flex-shrink-0">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="rinfo flex-1 min-w-0">
                      <div className="rn text-[0.86rem] font-medium truncate">{s.name}</div>
                    </div>
                    <span className="role text-[0.7rem] font-semibold px-2 py-0.5 rounded-full bg-[var(--blue-012)] text-[var(--xiv-blue)] flex-shrink-0">
                      {s.role}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground px-5 py-4">No staff clocked in</p>
              )}
            </div>
          </section>

          {/* Command hints */}
          <section className="panel">
            <div className="ph flex items-center gap-3 px-5 py-4 border-b border-[var(--blue-008)]">
              <span className="pt font-[var(--font-outfit)] font-semibold text-[0.9rem] flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[var(--xiv-blue)]" /> In-game commands
              </span>
            </div>
            <div className="cmd-hint px-5 py-[18px]">
              <p className="text-[0.78rem] text-muted-foreground mb-[14px]">
                Log directly from the Dalamud plugin chat.
              </p>
              <div className="cmd-list flex flex-col gap-2">
                {(
                  [
                    ["/xvm sale <amount>", "Log a sale"],
                    ["/xvm start", "Start event"],
                    ["/xvm end", "End event"],
                    ["/xvm help", "All commands"],
                  ] as [string, string][]
                ).map(([cmd, desc]) => (
                  <div
                    key={cmd}
                    className="cmd flex items-center justify-between gap-2 font-mono text-[0.8rem] text-[var(--xiv-blue)] bg-[var(--blue-010)] border border-[var(--blue-015)] px-3 py-2 rounded-[var(--radius-md)]"
                  >
                    <span>{cmd}</span>
                    <span className="text-[var(--fg-faint)] font-sans text-[0.72rem]">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
