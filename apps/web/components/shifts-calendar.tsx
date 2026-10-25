// apps/web/components/shifts-calendar.tsx
"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { dayKeyFor, hourLabelFor, utcDayKey, type CalendarShift, type StaffMember, type RoleOption } from "@/lib/shift-format"
import { browserTimeZone } from "@/lib/local-day"
import { ShiftDayDialog } from "@/components/shift-day-dialog"

interface ShiftsCalendarProps {
  shifts: CalendarShift[]
  currentMembershipId: string
  canManage: boolean
  venueSlug: string
  venueId: string
  staffForDialog: StaffMember[]
  roles: RoleOption[]
  todayKeyST: string
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function utcMonthStart(base: Date): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1))
}

function addUTCMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
}

function daysInUTCMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
}

function fmtMonthLabel(d: Date): string {
  return d.toLocaleString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" })
}

export function ShiftsCalendar({
  shifts,
  currentMembershipId,
  canManage,
  venueSlug,
  venueId,
  staffForDialog,
  roles,
  todayKeyST,
}: ShiftsCalendarProps) {
  const [monthCursor, setMonthCursor] = useState(() => utcMonthStart(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const timeZone = mounted ? browserTimeZone() : null

  const todayKey = mounted ? dayKeyFor(new Date(), timeZone) : todayKeyST
  const firstOfMonth = utcMonthStart(monthCursor)
  const leadingBlanks = firstOfMonth.getUTCDay() // 0 = Sunday
  const totalDays = daysInUTCMonth(monthCursor)

  const cells: (Date | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from(
      { length: totalDays },
      (_, i) => new Date(Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth(), i + 1))
    ),
  ]

  // Own shifts (shown in the cell), grouped by day key.
  const ownByDay = new Map<string, CalendarShift[]>()
  // Whether the venue has ANY shift that day the viewer doesn't personally work —
  // drives the manager-only coverage dot so a day off doesn't look empty to manage.
  const otherCoverageDays = new Set<string>()

  for (const shift of shifts) {
    const key = dayKeyFor(new Date(shift.scheduledStart), timeZone)
    if (shift.membershipId === currentMembershipId) {
      if (!ownByDay.has(key)) ownByDay.set(key, [])
      ownByDay.get(key)!.push(shift)
    } else if (canManage && shift.status !== "CANCELLED" && shift.status !== "OPEN") {
      // Only a real, assigned, non-cancelled shift counts as "other staff
      // scheduled" — a cancelled shift or an unfilled OPEN slot means
      // nobody is actually covering this day, so the dot shouldn't imply
      // otherwise.
      otherCoverageDays.add(key)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{fmtMonthLabel(monthCursor)}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonthCursor(utcMonthStart(new Date()))}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11"
            onClick={() => setMonthCursor(addUTCMonths(monthCursor, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11"
            onClick={() => setMonthCursor(addUTCMonths(monthCursor, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {DAY_HEADERS.map((day) => (
          <div key={day} className="text-center font-semibold text-sm text-muted-foreground py-2">
            {day}
          </div>
        ))}

        {cells.map((day, index) => {
          if (!day) return <div key={index} />

          const key = utcDayKey(day)
          const isToday = key === todayKey
          const dayShifts = ownByDay.get(key) ?? []
          const hasOtherCoverage = otherCoverageDays.has(key)

          return (
            <Card
              key={index}
              className={`min-h-[92px] cursor-pointer transition-colors hover:border-[rgba(0,180,255,0.4)] ${isToday ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedDate(day)}
            >
              <CardContent className="p-2 relative">
                {hasOtherCoverage && (
                  <span
                    className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[var(--xiv-blue)]"
                    title="Other staff scheduled this day"
                  />
                )}
                <div className="text-sm font-semibold mb-1">{day.getUTCDate()}</div>
                <div className="space-y-1">
                  {dayShifts.slice(0, 3).map((shift) => (
                    <div
                      key={shift.id}
                      className={`shift-chip${shift.status === "ACTIVE" ? " em" : shift.status === "MISSED" ? " am" : ""}${shift.status === "CANCELLED" ? " opacity-50 line-through" : ""}`}
                    >
                      {hourLabelFor(shift.scheduledStart, timeZone)}–{hourLabelFor(shift.scheduledEnd, timeZone)}
                    </div>
                  ))}
                  {dayShifts.length > 3 && (
                    <div className="text-xs text-muted-foreground">+{dayShifts.length - 3} more</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <ShiftDayDialog
        date={selectedDate}
        onOpenChange={(open) => {
          if (!open) setSelectedDate(null)
        }}
        shifts={shifts}
        canManage={canManage}
        currentMembershipId={currentMembershipId}
        venueSlug={venueSlug}
        venueId={venueId}
        staffForDialog={staffForDialog}
        roles={roles}
      />
    </div>
  )
}
