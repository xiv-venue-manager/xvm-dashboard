"use client"

import { Fragment } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ClaimedShiftChip } from "@/components/claimed-shift-chip"
import { OpenShiftChip } from "@/components/open-shift-chip"
import { DeleteShiftButton } from "@/components/delete-shift-button"
import { ClockShiftButton } from "@/components/clock-shift-button"
import { localDayKey, localHourLabel, browserTimeZone } from "@/lib/local-day"
import { staffNameOf, type ShiftRow, type StaffNameLookup } from "@/lib/shift-format"
import { useMounted } from "@/lib/use-mounted"

const ST_TZ = "Etc/UTC"

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// "2026-06-02" -> "2026-06-03". Pure string/date-math, no wall-clock read —
// safe to use pre-mount to derive "tomorrow" from the server-computed
// todayKeyST without diverging between SSR and the client's first render.
function addDayToKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number)
  return utcDayKey(new Date(Date.UTC(y, m - 1, d + 1)))
}

const statusBadge: Record<string, string> = {
  SCHEDULED: "bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]",
  ACTIVE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  COMPLETED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  MISSED: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
}

export interface ShiftsWeekViewProps {
  weekShifts: ShiftRow[] // padded-window rows from Task 2's query
  activeCount: number // venue-wide count of ACTIVE shifts (badge only, no row data needed)
  weekStartISO: string // ST Monday, from page.tsx's weekStart.toISOString()
  todayKeyST: string // server-computed "today" day-key (ST/UTC) — the only safe pre-mount "today" value
  isCurrentWeek: boolean
  fmtWeekLabelST: string // pre-formatted "Mon 2 Jun" for the ST week label
  slug: string
  currentMembershipId: number
  canManage: boolean
  staffNames: StaffNameLookup
}

export function ShiftsWeekView(props: ShiftsWeekViewProps) {
  const mounted = useMounted()
  const timeZone = mounted ? browserTimeZone() : ST_TZ
  const dayKeyOf = (d: Date | string) => (mounted ? localDayKey(d, timeZone) : utcDayKey(new Date(d)))
  const hourLabelOf = (d: Date | string) =>
    mounted
      ? localHourLabel(d, timeZone)
      : (() => {
          const date = new Date(d)
          const h = date.getUTCHours()
          const m = date.getUTCMinutes()
          const ampm = h >= 12 ? "PM" : "AM"
          const h12 = h % 12 || 12
          return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`
        })()

  const weekStart = new Date(props.weekStartISO)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setUTCDate(d.getUTCDate() + i)
    return d
  })
  const weekDayKeys = weekDays.map((d) => dayKeyOf(d))
  // Pre-mount, "today" must come from the server-computed prop, not a fresh
  // `new Date()` read — SSR and the client's first render can see different
  // wall clocks (clock skew, or the render straddling UTC midnight), and
  // that mismatch would show up as a hydration diff on the today-col class
  // and the "Today"/"Tomorrow" labels below. Only read the live clock once
  // mounted is true (post-hydration, safe to diverge).
  const todayKey = mounted ? dayKeyOf(new Date()) : props.todayKeyST

  const staffMap = new Map<
    number,
    {
      membershipId: number
      name: string
      cells: Map<string, ShiftRow[]>
    }
  >()
  for (const shift of props.weekShifts) {
    if (!shift.membershipId) continue
    const key = dayKeyOf(shift.scheduledStart)
    if (!weekDayKeys.includes(key)) continue
    const mid = shift.membershipId
    if (!staffMap.has(mid)) {
      staffMap.set(mid, {
        membershipId: mid,
        name: staffNameOf(mid, props.staffNames),
        cells: new Map(),
      })
    }
    const member = staffMap.get(mid)!
    if (!member.cells.has(key)) member.cells.set(key, [])
    member.cells.get(key)!.push(shift)
  }
  const staffRows = [...staffMap.values()]

  const openShiftsByDay = new Map<string, ShiftRow[]>()
  for (const shift of props.weekShifts) {
    if (shift.status !== "OPEN") continue
    const key = dayKeyOf(shift.scheduledStart)
    if (!weekDayKeys.includes(key)) continue
    if (!openShiftsByDay.has(key)) openShiftsByDay.set(key, [])
    openShiftsByDay.get(key)!.push(shift)
  }
  const hasOpenShifts = openShiftsByDay.size > 0

  const shownWeekShifts = props.weekShifts.filter((s) => weekDayKeys.includes(dayKeyOf(s.scheduledStart)))
  const activeWeekShifts = shownWeekShifts.filter((s) => s.status !== "CANCELLED")
  const seatsOf = (s: ShiftRow) => (s.status === "OPEN" ? (s.seatsLeft ?? 1) : 1)
  const activeSeats = activeWeekShifts.reduce((total, s) => total + seatsOf(s), 0)
  const openSlots = shownWeekShifts.reduce(
    (total, s) => total + (s.status === "OPEN" || s.status === "CLAIMED" ? seatsOf(s) : 0),
    0
  )
  const missedCount = shownWeekShifts.filter((s) => s.status === "MISSED").length
  const coverPct = activeSeats === 0 ? 100 : Math.round(((activeSeats - openSlots) / activeSeats) * 100)
  const reliabilityPct = activeSeats === 0 ? 100 : Math.round(((activeSeats - missedCount) / activeSeats) * 100)

  const actionShifts = shownWeekShifts.filter((s) => s.status === "SCHEDULED" || s.status === "ACTIVE")
  // Same pre/post-mount split as todayKey above: pre-mount, derive "tomorrow"
  // from the server-computed todayKeyST via pure date math (no wall-clock
  // read); only read a fresh `new Date()` once mounted is true.
  const tomorrowKey = mounted
    ? dayKeyOf(
        (() => {
          const d = new Date()
          d.setUTCDate(d.getUTCDate() + 1)
          return d
        })()
      )
    : addDayToKey(props.todayKeyST)
  function dayLabel(key: string): string {
    if (key === todayKey) return "Today"
    if (key === tomorrowKey) return "Tomorrow"
    const parts = key.split("-").map(Number)
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
    return d.toLocaleString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
  }
  const actionShiftsByDay = new Map<string, ShiftRow[]>()
  for (const shift of actionShifts) {
    const key = dayKeyOf(shift.scheduledStart)
    if (!actionShiftsByDay.has(key)) actionShiftsByDay.set(key, [])
    actionShiftsByDay.get(key)!.push(shift)
  }
  const actionDayKeys = [...actionShiftsByDay.keys()].sort()

  return (
    <>
      {/* KPIs */}
      <div className="kpis mb-6">
        {[
          {
            k: "Shifts this week",
            v: activeSeats,
            sub: mounted ? "your local time" : props.fmtWeekLabelST,
            icon: "M12 2a10 10 0 1 1 0 20A10 10 0 0 1 12 2zm0 2v8l4 2",
          },
          {
            k: "Open shifts",
            v: openSlots,
            sub: "needs cover",
            icon: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01",
          },
          {
            k: "Active now",
            v: props.activeCount,
            sub: "on shift",
            icon: "M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83",
          },
          {
            k: "Coverage",
            v: `${coverPct}%`,
            sub: "shifts filled",
            icon: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
          },
          {
            k: "Reliability",
            v: `${reliabilityPct}%`,
            sub: "no-shows excl.",
            icon: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
          },
        ].map(({ k, v, sub, icon }) => (
          <div key={k} className="stat">
            <div className="top">
              <span className="sb">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d={icon} />
                </svg>
              </span>
            </div>
            <div className="k">{k}</div>
            <div className="v">{v}</div>
            <div className="delta flat">{sub}</div>
          </div>
        ))}
      </div>

      {/* Week nav toolbar label only — prev/next Links stay in page.tsx (server-rendered, ST-anchored) */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="px-3 text-sm font-semibold min-w-[90px] text-center">
          {props.isCurrentWeek ? "This week" : props.fmtWeekLabelST}
        </span>
        {!props.isCurrentWeek && (
          <a href={`/dashboard/${props.slug}/shifts`} className="text-xs text-[var(--xiv-blue)] hover:underline">
            Back to current week
          </a>
        )}
      </div>

      {/* Weekly grid */}
      <div className="panel mb-6 sched">
        <div className="sched-grid">
          <div className="sg-h staffcol">Staff</div>
          {weekDayKeys.map((key, i) => (
            <div key={i} className={`sg-h${key === todayKey ? " today-col" : ""}`}>
              {new Date(key + "T00:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short" })}{" "}
              <span className="dnum">{Number(key.slice(8, 10))}</span>
            </div>
          ))}

          {staffRows.map((member) => (
            <Fragment key={member.membershipId}>
              <div key={`${member.membershipId}-name`} className="sg-staff">
                <span className="av-sm flex-shrink-0">
                  {member.name
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <span className="truncate">{member.name}</span>
              </div>
              {weekDayKeys.map((key) => {
                const dayShifts = member.cells.get(key) ?? []
                return (
                  <div
                    key={`${member.membershipId}-${key}`}
                    className={`sg-cell${key === todayKey ? " today-col" : ""}`}
                  >
                    {dayShifts.map((shift) =>
                      shift.status === "CLAIMED" ? (
                        <ClaimedShiftChip
                          key={shift.id}
                          shiftId={shift.id}
                          venueSlug={props.slug}
                          timeLabel={`${hourLabelOf(shift.scheduledStart)}–${hourLabelOf(shift.scheduledEnd)}${shift.roleName ? ` · ${shift.roleName}` : ""}`}
                          canManage={props.canManage}
                        />
                      ) : (
                        <div key={shift.id} className="flex items-center gap-1">
                          <span
                            className={`shift-chip${shift.status === "ACTIVE" ? " em" : shift.status === "MISSED" ? " am" : ""}`}
                          >
                            {hourLabelOf(shift.scheduledStart)}–{hourLabelOf(shift.scheduledEnd)}
                            {shift.roleName ? ` · ${shift.roleName}` : ""}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )
              })}
            </Fragment>
          ))}

          {hasOpenShifts && (
            <>
              <div key="open-shifts-name" className="sg-staff">
                <span className="av-sm flex-shrink-0 border border-dashed border-amber-500/40 bg-amber-500/10 text-amber-400">
                  !
                </span>
                <span className="truncate text-amber-400">Open shifts</span>
              </div>
              {weekDayKeys.map((key) => {
                const dayShifts = openShiftsByDay.get(key) ?? []
                return (
                  <div key={`open-${key}`} className={`sg-cell${key === todayKey ? " today-col" : ""}`}>
                    {dayShifts.map((shift) => (
                      <div key={shift.id} className="flex items-center gap-1">
                        {shift.heldByMe ? (
                          <span className="shift-chip op">
                            {hourLabelOf(shift.scheduledStart)}–{hourLabelOf(shift.scheduledEnd)}
                            {shift.roleName ? ` · ${shift.roleName}` : ""}
                          </span>
                        ) : (
                          <OpenShiftChip
                            eventShiftId={shift.eventShiftId ?? 0}
                            venueSlug={props.slug}
                            timeLabel={`${hourLabelOf(shift.scheduledStart)}–${hourLabelOf(shift.scheduledEnd)}${shift.roleName ? ` · ${shift.roleName}` : ""}`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
            </>
          )}

          {/* Empty state */}
          {staffRows.length === 0 && !hasOpenShifts && (
            <div className="col-span-8 py-12 text-center text-sm text-muted-foreground">
              No shifts scheduled for this week.
              {props.canManage && " Use the button above to add shifts."}
            </div>
          )}
        </div>
      </div>

      {/* Actions section — clock-in/out for shifts that need it */}
      {actionShifts.length > 0 && (
        <div>
          <h2 className="font-cinzel text-base font-bold tracking-[0.02em] mb-3">
            {props.activeCount > 0 ? "On shift now" : "Upcoming: actions needed"}
          </h2>
          <div className="grid grid-cols-1 gap-2">
            {actionDayKeys.map((dayKey) => (
              <Fragment key={dayKey}>
                <div className="flex items-center gap-2 mt-2 first:mt-0">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {dayLabel(dayKey)}
                  </span>
                  <span className="flex-1 h-px bg-[var(--blue-015)]" />
                </div>
                {actionShiftsByDay.get(dayKey)!.map((shift) => (
                  <Card key={shift.id}>
                    <CardContent className="p-3 md:p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarImage src={undefined} />
                          <AvatarFallback className="text-[0.65rem] font-bold">
                            {staffNameOf(shift.membershipId, props.staffNames).slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {staffNameOf(shift.membershipId, props.staffNames)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {hourLabelOf(shift.scheduledStart)} — {hourLabelOf(shift.scheduledEnd)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="outline" className={statusBadge[shift.status] ?? ""}>
                            {shift.status}
                          </Badge>
                          {props.canManage && shift.status === "SCHEDULED" && (
                            <ClockShiftButton
                              venueSlug={props.slug}
                              shiftId={shift.id}
                              action="clock-in"
                              staffName={staffNameOf(shift.membershipId, props.staffNames)}
                            />
                          )}
                          {props.canManage && shift.status === "ACTIVE" && (
                            <ClockShiftButton
                              venueSlug={props.slug}
                              shiftId={shift.id}
                              action="clock-out"
                              staffName={staffNameOf(shift.membershipId, props.staffNames)}
                            />
                          )}
                          {!props.canManage &&
                            shift.membershipId === props.currentMembershipId &&
                            shift.status === "SCHEDULED" && (
                              <ClockShiftButton
                                venueSlug={props.slug}
                                shiftId={shift.id}
                                action="clock-in"
                                staffName="yourself"
                              />
                            )}
                          {!props.canManage &&
                            shift.membershipId === props.currentMembershipId &&
                            shift.status === "ACTIVE" && (
                              <ClockShiftButton
                                venueSlug={props.slug}
                                shiftId={shift.id}
                                action="clock-out"
                                staffName="yourself"
                              />
                            )}
                          {props.canManage && (
                            <DeleteShiftButton
                              venueSlug={props.slug}
                              shiftId={shift.id}
                              hasPayroll={!!shift.payrollEntryId}
                            />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
