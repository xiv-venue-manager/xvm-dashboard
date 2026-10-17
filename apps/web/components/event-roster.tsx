"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ClaimedShiftChip } from "@/components/claimed-shift-chip"
import { OpenShiftChip } from "@/components/open-shift-chip"
import { hourLabelFor } from "@/lib/shift-format"
import { browserTimeZone } from "@/lib/local-day"
import { useMounted } from "@/lib/use-mounted"
import type { RosterPosition, RosterShift, ShiftStaffOption } from "@/lib/api/xvm-api"

interface EventRosterProps {
  venueSlug: string
  eventId: string
  canManage: boolean
  currentMembershipId: number | null
  roster: RosterPosition[]
  positionOptions: { id: number; name: string }[]
  staff: ShiftStaffOption[]
  defaultStartsAt: string
  defaultEndsAt: string
}

function dayLabel(iso: string, timeZone: string | null): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: timeZone ?? "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EventRoster(props: EventRosterProps) {
  const { venueSlug, eventId, canManage, currentMembershipId, roster, positionOptions, staff } = props
  const router = useRouter()
  const mounted = useMounted()
  const timeZone = mounted ? browserTimeZone() : null
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newPosition, setNewPosition] = useState<string>("")
  const [addingShiftFor, setAddingShiftFor] = useState<number | null>(null)
  const [starts, setStarts] = useState(toLocalInput(props.defaultStartsAt))
  const [ends, setEnds] = useState(toLocalInput(props.defaultEndsAt))
  const [capacity, setCapacity] = useState("1")
  const [assignTo, setAssignTo] = useState<Record<number, string>>({})
  const [confirming, setConfirming] = useState<string | null>(null)

  const base = `/api/venues/${venueSlug}`

  async function act(url: string, method: "POST" | "DELETE", body?: unknown): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "Something went wrong")
        return false
      }
      router.refresh()
      return true
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  async function addPosition() {
    if (!newPosition) return
    if (await act(`${base}/events/${eventId}/roster/positions`, "POST", { positionId: Number(newPosition) })) {
      setNewPosition("")
    }
  }

  async function addShift(eventPositionId: number) {
    const startsAt = new Date(starts)
    const endsAt = new Date(ends)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      setError("End time must be after start time")
      return
    }
    const seats = Number(capacity)
    if (!Number.isInteger(seats) || seats < 1) {
      setError("A shift needs at least one seat")
      return
    }
    const added = await act(`${base}/events/${eventId}/roster/positions/${eventPositionId}/shifts`, "POST", {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      capacity: seats,
    })
    if (added) setAddingShiftFor(null)
  }

  function confirmable(key: string, label: string, run: () => void) {
    return confirming === key ? (
      <span className="flex items-center gap-1">
        <Button size="sm" variant="destructive" disabled={busy} onClick={run}>
          Confirm
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
          Keep
        </Button>
      </span>
    ) : (
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(key)}>
        {label}
      </Button>
    )
  }

  function shiftRow(shift: RosterShift) {
    const cancelled = shift.cancelled_at !== null
    const free = shift.capacity - shift.taken - shift.pending
    const iAmSeated = shift.people.some((p) => p.membership_id === currentMembershipId)
    const timeLabel = `${dayLabel(shift.starts_at, timeZone)} · ${hourLabelFor(shift.starts_at, timeZone)}–${hourLabelFor(shift.ends_at, timeZone)}`
    return (
      <div
        key={shift.id}
        className={`rounded-lg border border-[var(--blue-008)] p-3 space-y-2 ${cancelled ? "opacity-60" : ""}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">
            {timeLabel}
            <span className="ml-2 text-xs text-muted-foreground">
              {cancelled
                ? "Cancelled"
                : `${shift.taken + shift.pending} of ${shift.capacity} ${shift.capacity === 1 ? "seat" : "seats"}`}
            </span>
          </div>
          {canManage && !cancelled && (
            <div className="flex items-center gap-1">
              {confirmable(`cancel-${shift.id}`, "Cancel shift", () =>
                act(`${base}/event-shifts/${shift.id}/cancel`, "POST", {})
              )}
              {confirmable(`delete-${shift.id}`, "Delete", () => act(`${base}/event-shifts/${shift.id}`, "DELETE"))}
            </div>
          )}
        </div>

        {shift.people.map((person) => (
          <div key={person.shift_id} className="flex items-center justify-between gap-2 text-sm">
            <span>{person.name}</span>
            {person.approved_at === null ? (
              <ClaimedShiftChip
                shiftId={person.shift_id}
                venueSlug={venueSlug}
                timeLabel="Pending"
                canManage={canManage}
              />
            ) : (
              canManage &&
              confirmable(`remove-${person.shift_id}`, "Remove", async () => {
                setError(null)
                const res = await fetch(`${base}/shifts/${person.shift_id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "reject" }),
                })
                if (res.ok) router.refresh()
                else setError((await res.json().catch(() => ({}))).error ?? "Something went wrong")
                setConfirming(null)
              })
            )}
          </div>
        ))}

        {!cancelled && free > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{free} free</span>
            {canManage ? (
              <>
                <Select
                  value={assignTo[shift.id] ?? ""}
                  onValueChange={(value) => setAssignTo((prev) => ({ ...prev, [shift.id]: value }))}
                >
                  <SelectTrigger className="h-8 w-48">
                    <SelectValue placeholder="Assign someone" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((member) => (
                      <SelectItem key={member.id} value={member.id.toString()}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={busy || !assignTo[shift.id]}
                  onClick={() =>
                    act(`${base}/event-shifts/${shift.id}/assign`, "POST", { membershipId: Number(assignTo[shift.id]) })
                  }
                >
                  Assign
                </Button>
              </>
            ) : (
              !iAmSeated && <OpenShiftChip eventShiftId={shift.id} venueSlug={venueSlug} timeLabel={timeLabel} />
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-400">{error}</p>}

      {roster.length === 0 && <p className="text-sm text-muted-foreground">No positions are working this event yet.</p>}

      {roster.map((position) => (
        <div key={position.id} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{position.name}</h3>
            {canManage && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAddingShiftFor(addingShiftFor === position.id ? null : position.id)}
                >
                  Add shift
                </Button>
                {confirmable(`position-${position.id}`, "Remove position", () =>
                  act(`${base}/events/${eventId}/roster/positions/${position.id}`, "DELETE")
                )}
              </div>
            )}
          </div>

          {addingShiftFor === position.id && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--blue-008)] p-3">
              <label className="text-xs text-muted-foreground">
                Starts
                <Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
              </label>
              <label className="text-xs text-muted-foreground">
                Ends
                <Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
              </label>
              <label className="text-xs text-muted-foreground">
                Seats
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </label>
              <Button size="sm" disabled={busy} onClick={() => addShift(position.id)}>
                Add
              </Button>
            </div>
          )}

          {position.shifts.length === 0 && <p className="text-xs text-muted-foreground">No shifts yet.</p>}
          {position.shifts.map(shiftRow)}
        </div>
      ))}

      {canManage && positionOptions.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={newPosition} onValueChange={setNewPosition}>
            <SelectTrigger className="h-8 w-56">
              <SelectValue placeholder="Add a position" />
            </SelectTrigger>
            <SelectContent>
              {positionOptions.map((option) => (
                <SelectItem key={option.id} value={option.id.toString()}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={busy || !newPosition} onClick={addPosition}>
            Add
          </Button>
        </div>
      )}
    </div>
  )
}
