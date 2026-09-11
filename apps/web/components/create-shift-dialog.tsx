"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRouter } from "next/navigation"

interface StaffMember {
  id: number
  name: string
  image: string | null
}

interface RoleOption {
  id: number
  name: string
}

interface EventOption {
  id: string
  name: string
}

interface ShiftPrefill {
  mode?: "assign" | "open"
  membershipId?: number
  roleId?: number
  date?: string
  startTime?: string
  endTime?: string
  notes?: string
  eventId?: string
}

interface CreateShiftDialogProps {
  venueSlug: string
  staff: StaffMember[]
  roles: RoleOption[]
  trigger?: React.ReactNode
  prefill?: ShiftPrefill
  events?: EventOption[]
}

export function CreateShiftDialog({
  venueSlug,
  staff,
  roles,
  trigger,
  prefill,
  events,
}: CreateShiftDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<"assign" | "open">(prefill?.mode ?? "assign")
  const [membershipId, setMembershipId] = useState<number | undefined>(prefill?.membershipId)
  const [roleId, setRoleId] = useState<number | undefined>(prefill?.roleId)
  const [date, setDate] = useState(prefill?.date ?? "")
  const [startTime, setStartTime] = useState(prefill?.startTime ?? "19:00")
  const [endTime, setEndTime] = useState(prefill?.endTime ?? "23:00")
  const [notes, setNotes] = useState(prefill?.notes ?? "")
  const [eventId, setEventId] = useState(prefill?.eventId ?? "")

  async function handleSubmit() {
    if (mode === "assign" && !membershipId) {
      setError("Please select a staff member")
      return
    }
    if (mode === "open" && !roleId) {
      setError("Please select a role")
      return
    }
    if (!date || !startTime || !endTime) {
      setError("Please fill in all required fields")
      return
    }

    const scheduledStartDate = new Date(`${date}T${startTime}:00`)
    let scheduledEndDate = new Date(`${date}T${endTime}:00`)

    if (scheduledEndDate.getTime() === scheduledStartDate.getTime()) {
      setError("End time must be after start time")
      return
    }
    if (scheduledEndDate < scheduledStartDate) {
      scheduledEndDate = new Date(scheduledEndDate.getTime() + 86400000)
    }

    const scheduledStart = scheduledStartDate.toISOString()
    const scheduledEnd = scheduledEndDate.toISOString()

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/venues/${venueSlug}/shifts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(mode === "assign" ? { membershipId, ...(roleId ? { roleId } : {}) } : { roleId }),
          scheduledStart,
          scheduledEnd,
          notes: notes || undefined,
          ...(eventId ? { eventId } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to create shift")
        return
      }

      setMode(prefill?.mode ?? "assign")
      setMembershipId(prefill?.membershipId)
      setRoleId(prefill?.roleId)
      setDate(prefill?.date ?? "")
      setStartTime(prefill?.startTime ?? "19:00")
      setEndTime(prefill?.endTime ?? "23:00")
      setNotes(prefill?.notes ?? "")
      setEventId(prefill?.eventId ?? "")
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError("Network error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button>Schedule Shift</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{prefill ? "Duplicate Shift" : "Schedule a Shift"}</DialogTitle>
          <DialogDescription>
            Assign a staff member now, or leave the slot open for a specific role to be filled later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Assignment</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "assign" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("assign")}
              >
                Assign to staff member
              </Button>
              <Button
                type="button"
                variant={mode === "open" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("open")}
              >
                Leave open (require role)
              </Button>
            </div>
          </div>

          {mode === "assign" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="staff">Staff Member</Label>
                <Select
                  value={membershipId?.toString() ?? ""}
                  onValueChange={(v) => setMembershipId(v ? Number(v) : undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assign-role">Role (optional, for pay)</Label>
                <div className="flex gap-2">
                  <Select value={roleId?.toString() ?? ""} onValueChange={(v) => setRoleId(v ? Number(v) : undefined)}>
                    <SelectTrigger>
                      <SelectValue placeholder="No specific role tagged" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id.toString()}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {roleId && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setRoleId(undefined)}>
                      Clear
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tags this shift with a role for pay purposes. The role&apos;s rate is used instead of the staff member&apos;s
                  own rate when payroll is generated.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="role">Required Role</Label>
              <Select value={roleId?.toString() ?? ""} onValueChange={(v) => setRoleId(v ? Number(v) : undefined)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select required role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id.toString()}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No custom roles set up yet. Create one in Staff settings first.
                </p>
              )}
            </div>
          )}

          {events && events.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="event">Event (optional, for pot payroll)</Label>
              <div className="flex gap-2">
                <Select value={eventId} onValueChange={setEventId}>
                  <SelectTrigger id="event">
                    <SelectValue placeholder="No event" />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {eventId && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setEventId("")}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start">Start</Label>
              <Input id="start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">End</Label>
              <Input id="end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">Times shown in your local time</p>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              placeholder="e.g. DJ set, bartender, greeter"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating..." : "Create Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
