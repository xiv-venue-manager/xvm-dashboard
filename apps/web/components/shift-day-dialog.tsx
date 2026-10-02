// apps/web/components/shift-day-dialog.tsx
"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CreateShiftDialog } from "@/components/create-shift-dialog"
import { ClockShiftButton } from "@/components/clock-shift-button"
import { DeleteShiftButton } from "@/components/delete-shift-button"
import { OpenShiftChip } from "@/components/open-shift-chip"
import { ClaimedShiftChip } from "@/components/claimed-shift-chip"
import { Copy } from "lucide-react"
import {
  dayKeyFor,
  hourLabelFor,
  statusBadgeClass,
  staffNameOf,
  type CalendarShift,
  type StaffMember,
  type RoleOption,
} from "@/lib/shift-format"
import { browserTimeZone, localTimeInput } from "@/lib/local-day"

interface ShiftDayDialogProps {
  date: Date | null
  onOpenChange: (open: boolean) => void
  shifts: CalendarShift[]
  canManage: boolean
  currentMembershipId: string
  venueSlug: string
  venueId: string
  staffForDialog: StaffMember[]
  roles: RoleOption[]
}

export function ShiftDayDialog({
  date,
  onOpenChange,
  shifts,
  canManage,
  currentMembershipId,
  venueSlug,
  venueId,
  staffForDialog,
  roles,
}: ShiftDayDialogProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const timeZone = mounted ? browserTimeZone() : null

  const open = date !== null
  const dayShifts = date
    ? shifts.filter((s) => dayKeyFor(new Date(s.scheduledStart), timeZone) === dayKeyFor(date, timeZone))
    : []
  const visibleShifts = canManage ? dayShifts : dayShifts.filter((s) => s.membershipId === currentMembershipId)

  const dateLabel = date
    ? date.toLocaleString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
    : ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dateLabel}</DialogTitle>
          <DialogDescription>{canManage ? "All shifts scheduled this day" : "Your shifts this day"}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          {visibleShifts.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {canManage ? "No shifts scheduled for this day." : "You have no shifts this day."}
            </div>
          )}

          {visibleShifts.map((shift) => {
            if (shift.status === "OPEN" && date) {
              return (
                <div
                  key={shift.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--blue-008)] px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="av-sm flex-shrink-0 border border-dashed border-amber-500/40 bg-amber-500/10 text-amber-400">
                      !
                    </span>
                    <div className="text-sm">
                      <div className="font-medium text-amber-400">
                        Open{shift.role?.name ? ` · ${shift.role.name}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {hourLabelFor(shift.scheduledStart, timeZone)}–{hourLabelFor(shift.scheduledEnd, timeZone)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <OpenShiftChip
                      shiftId={shift.id}
                      venueId={venueId}
                      timeLabel={`${hourLabelFor(shift.scheduledStart, timeZone)}–${hourLabelFor(shift.scheduledEnd, timeZone)}`}
                    />
                    {canManage && (
                      <CreateShiftDialog
                        venueSlug={venueSlug}
                        staff={staffForDialog}
                        roles={roles}
                        trigger={
                          <Button variant="ghost" size="sm" aria-label="Duplicate shift" className="h-6 w-6 p-0">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        }
                        prefill={{
                          mode: "open",
                          roleId: shift.roleId ?? undefined,
                          date: dayKeyFor(date, timeZone),
                          startTime: mounted
                            ? localTimeInput(shift.scheduledStart, timeZone!)
                            : new Date(shift.scheduledStart).toISOString().slice(11, 16),
                          endTime: mounted
                            ? localTimeInput(shift.scheduledEnd, timeZone!)
                            : new Date(shift.scheduledEnd).toISOString().slice(11, 16),
                          notes: shift.notes ?? undefined,
                        }}
                      />
                    )}
                    {canManage && (
                      <DeleteShiftButton
                        venueSlug={venueSlug}
                        shiftId={shift.id}
                        hasPayroll={false}
                        isRecurring={Boolean(shift.recurrenceRule || shift.parentShiftId)}
                        slotGroupId={shift.slotGroupId}
                      />
                    )}
                  </div>
                </div>
              )
            }

            return (
              <div
                key={shift.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--blue-008)] px-3 py-2.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {canManage && (
                    <Avatar className="h-7 w-7 flex-shrink-0">
                      <AvatarImage src={shift.membership?.user?.image ?? undefined} />
                      <AvatarFallback className="text-[0.62rem] font-bold">
                        {staffNameOf(shift.membership).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="min-w-0">
                    {canManage && <div className="text-sm font-medium truncate">{staffNameOf(shift.membership)}</div>}
                    <div className="text-xs text-muted-foreground">
                      {hourLabelFor(shift.scheduledStart, timeZone)}–{hourLabelFor(shift.scheduledEnd, timeZone)}
                      {shift.role?.name ? ` · ${shift.role.name}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge variant="outline" className={statusBadgeClass[shift.status] ?? ""}>
                    {shift.status}
                  </Badge>
                  {shift.status === "CLAIMED" ? (
                    <ClaimedShiftChip
                      shiftId={shift.id}
                      venueId={venueId}
                      timeLabel={`${hourLabelFor(shift.scheduledStart, timeZone)}–${hourLabelFor(shift.scheduledEnd, timeZone)}`}
                      canManage={canManage}
                    />
                  ) : (
                    <>
                      {(canManage || shift.membershipId === currentMembershipId) && shift.status === "SCHEDULED" && (
                        <ClockShiftButton
                          venueSlug={venueSlug}
                          shiftId={shift.id}
                          action="clock-in"
                          staffName={canManage ? staffNameOf(shift.membership) : "yourself"}
                        />
                      )}
                      {(canManage || shift.membershipId === currentMembershipId) && shift.status === "ACTIVE" && (
                        <ClockShiftButton
                          venueSlug={venueSlug}
                          shiftId={shift.id}
                          action="clock-out"
                          staffName={canManage ? staffNameOf(shift.membership) : "yourself"}
                        />
                      )}
                      {canManage && (
                        <DeleteShiftButton
                          venueSlug={venueSlug}
                          shiftId={shift.id}
                          hasPayroll={!!shift.payrollEntryId}
                          isRecurring={Boolean(shift.recurrenceRule || shift.parentShiftId)}
                          slotGroupId={shift.slotGroupId}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {canManage && date && (
          <CreateShiftDialog
            venueSlug={venueSlug}
            staff={staffForDialog}
            roles={roles}
            trigger={<Button className="w-full">Add shift</Button>}
            prefill={{ mode: "assign", date: dayKeyFor(date, timeZone) }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
