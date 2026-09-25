"use client"

import { Fragment, useEffect, useState } from "react"
import { formatHours, minorUnitsToGil } from "@/lib/api/position-convert"
import { useSession } from "next-auth/react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { VenueEyebrow } from "@/components/venue-eyebrow"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatReadout } from "@/components/ui/stat-readout"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { format } from "date-fns"
import { Plus, DollarSign, Clock, CheckCircle2, XCircle, Zap, Trash2, Users } from "lucide-react"
import { PageLoading } from "@/components/ui/loading-spinner"
import { resolveDisplayName } from "@/lib/display-name"
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

interface PayrollEntry {
  id: string
  membershipId: number | null
  paymentType: "FIXED_SALARY" | "HOURLY" | "POT_SHARE" | "CONTRACTOR_PAYOUT"
  baseRate: string
  hoursWorked: string | null
  bonusAmount: string | null
  totalAmount: string
  periodStart: string
  periodEnd: string
  isPaid: boolean
  paidAt: string | null
  notes: string | null
  potDistribution: {
    eventId: string
    regularSales: string
    contractorSales: string
    pooledTips: string
    potTotal: string
    recipientCount: number
    perPersonShare: string
  } | null
}

interface StaffMember {
  id: string
  userId: string | null
  role: string
  hourlyRate: string | null
  nickname: string | null
  user: {
    id: string
    name: string | null
    displayName: string | null
    characters: { characterName: string }[]
    image: string | null
  } | null
  customRole: {
    id: string
    name: string
  } | null
}

interface ShiftPreview {
  id: string
  scheduledStart: string
  scheduledEnd: string
  actualStart: string | null
  actualEnd: string | null
  hoursWorked: number
}

interface GeneratePreview {
  shifts: ShiftPreview[]
  summary: {
    shiftCount: number
    totalHours: number
    estimatedTotal: number | null
    unresolvedShiftCount: number
    entryCount: number
  }
}

function defaultDateFrom() {
  const d = new Date()
  d.setMonth(d.getMonth() - 12)
  return d.toISOString().slice(0, 10)
}

function defaultDateTo() {
  return new Date().toISOString().slice(0, 10)
}

export default function PayrollPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const slug = params?.slug as string

  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [tipsTotal, setTipsTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [filter, setFilter] = useState<"all" | "paid" | "unpaid">("all")
  const [dateFrom, setDateFrom] = useState(() => defaultDateFrom())
  const [dateTo, setDateTo] = useState(() => defaultDateTo())
  const [isCreating, setIsCreating] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [expandedEntryIds, setExpandedEntryIds] = useState<Set<string>>(new Set())

  function toggleExpanded(entryId: string) {
    setExpandedEntryIds((prev) => {
      const next = new Set(prev)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }

  // Form state
  const [selectedStaff, setSelectedStaff] = useState("")
  const [paymentType, setPaymentType] = useState<"FIXED_SALARY" | "HOURLY">("FIXED_SALARY")
  const [baseRate, setBaseRate] = useState("")
  const [hoursWorked, setHoursWorked] = useState("")
  const [bonusAmount, setBonusAmount] = useState("")
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [notes, setNotes] = useState("")

  // Generate from Shifts dialog state
  const [isGenerateOpen, setIsGenerateOpen] = useState(false)
  const [genStaff, setGenStaff] = useState("")
  const [genPeriodStart, setGenPeriodStart] = useState("")
  const [genPeriodEnd, setGenPeriodEnd] = useState("")
  const [genBonus, setGenBonus] = useState("")
  const [genNotes, setGenNotes] = useState("")
  const [genPreview, setGenPreview] = useState<GeneratePreview | null>(null)
  const [genLoading, setGenLoading] = useState(false)
  const [genCreating, setGenCreating] = useState(false)

  // Generate All state
  const [isGenAllOpen, setIsGenAllOpen] = useState(false)
  const [genAllStart, setGenAllStart] = useState("")
  const [genAllEnd, setGenAllEnd] = useState("")
  const [genAllPreview, setGenAllPreview] = useState<
    | {
        membershipId: number
        shiftCount: number
        totalHours: number
        estimatedTotal: number | null
        entryCount: number
        skipped: boolean
        skipReason: "no_shifts" | "unresolved_rate" | null
      }[]
    | null
  >(null)
  const [genAllLoading, setGenAllLoading] = useState(false)
  const [genAllCreating, setGenAllCreating] = useState(false)

  const venueId = params?.slug as string

  const fetchPayrollEntries = async () => {
    try {
      const isPaidQuery = filter === "paid" ? "true" : filter === "unpaid" ? "false" : ""
      const qs = new URLSearchParams({ from: dateFrom, to: dateTo })
      if (isPaidQuery) qs.set("isPaid", isPaidQuery)
      const response = await fetch(`/api/venues/${slug}/payroll?${qs}`)

      if (!response.ok) {
        if (response.status === 403) {
          router.push(`/dashboard/${slug}`)
          return
        }
        throw new Error("Failed to fetch payroll entries")
      }

      const data = await response.json()
      setPayrollEntries(data)

      // Fetch tips total for the current week
      try {
        const venueRes = await fetch(`/api/venues?slug=${slug}`)
        const venues = await venueRes.json()
        const venue = venues.find((v: { slug: string }) => v.slug === slug)
        if (venue) {
          const now = new Date()
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          const tipsRes = await fetch(`/api/venues/${venue.id}/transactions?kind=tip&startDate=${weekAgo.toISOString()}`)
          if (tipsRes.ok) {
            const { transactions } = (await tipsRes.json()) as { transactions: { amount: number }[] }
            const totalMinor = transactions.reduce((sum, t) => sum + t.amount, 0)
            setTipsTotal(Math.round(minorUnitsToGil(totalMinor) ?? 0))
          }
        }
      } catch {
        /* tips query is best-effort */
      }
    } catch (error) {
      console.error("Error fetching payroll entries:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStaff = async () => {
    try {
      const response = await fetch(`/api/venues/${slug}/staff`)

      if (!response.ok) {
        throw new Error("Failed to fetch staff")
      }

      const data = await response.json()
      // API already filters for active members with user accounts
      setStaff(data)
    } catch (error) {
      console.error("Error fetching staff:", error)
    }
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin")
    }
  }, [status, router])

  useEffect(() => {
    if (session && slug) {
      // Genuine data fetch (sets payroll/staff/loading state), not derivable from props/state during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchPayrollEntries()
      fetchStaff()
    }
  }, [session, slug, filter, dateFrom, dateTo])

  const handleCreatePayroll = async () => {
    setIsCreating(true)
    try {
      const response = await fetch(`/api/venues/${slug}/payroll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          membershipId: selectedStaff,
          paymentType,
          baseRate: parseFloat(baseRate),
          hoursWorked: paymentType === "HOURLY" && hoursWorked ? parseFloat(hoursWorked) : null,
          bonusAmount: bonusAmount ? parseFloat(bonusAmount) : null,
          periodStart,
          periodEnd,
          notes,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create payroll entry")
      }

      // Reset form
      setSelectedStaff("")
      setPaymentType("FIXED_SALARY")
      setBaseRate("")
      setHoursWorked("")
      setBonusAmount("")
      setPeriodStart("")
      setPeriodEnd("")
      setNotes("")
      setIsDialogOpen(false)

      // Refresh list
      fetchPayrollEntries()
    } catch (error) {
      console.error("Error creating payroll entry:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to create payroll entry"
      alert(errorMessage)
    } finally {
      setIsCreating(false)
    }
  }

  const handleMarkAsPaid = async (payrollId: string, currentStatus: boolean) => {
    setUpdatingId(payrollId)
    try {
      const response = await fetch(`/api/venues/${slug}/payroll/${payrollId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isPaid: !currentStatus,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update payroll entry")
      }

      // Refresh list
      fetchPayrollEntries()
    } catch (error) {
      console.error("Error updating payroll entry:", error)
      alert("Failed to update payroll entry")
    } finally {
      setUpdatingId(null)
    }
  }

  const handleDeleteEntry = async (payrollId: string) => {
    setUpdatingId(payrollId)
    try {
      const response = await fetch(`/api/venues/${slug}/payroll/${payrollId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        alert(body.error || `Delete failed (${response.status})`)
        return
      }
      fetchPayrollEntries()
    } catch (error) {
      console.error("Error deleting payroll entry:", error)
      alert("Failed to delete payroll entry")
    } finally {
      setUpdatingId(null)
    }
  }

  const fetchGeneratePreview = async () => {
    if (!genStaff || !genPeriodStart || !genPeriodEnd) return
    setGenLoading(true)
    setGenPreview(null)
    try {
      const params = new URLSearchParams({
        membershipId: genStaff,
        periodStart: genPeriodStart,
        periodEnd: genPeriodEnd,
      })
      const response = await fetch(`/api/venues/${slug}/payroll/generate?${params}`)
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Failed to fetch preview")
      }
      const data = await response.json()
      setGenPreview(data)
    } catch (error) {
      console.error("Error fetching generate preview:", error)
      const msg = error instanceof Error ? error.message : "Failed to fetch preview"
      alert(msg)
    } finally {
      setGenLoading(false)
    }
  }

  const handleGeneratePayroll = async () => {
    if (!genStaff || !genPeriodStart || !genPeriodEnd) return
    setGenCreating(true)
    try {
      const response = await fetch(`/api/venues/${slug}/payroll/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: genStaff,
          periodStart: genPeriodStart,
          periodEnd: genPeriodEnd,
          bonusAmount: genBonus ? parseFloat(genBonus) : undefined,
          notes: genNotes || undefined,
        }),
      })
      if (!response.ok) {
        const err = await response.json()
        if (response.status === 409 && Array.isArray(err.unresolvedShiftIds)) {
          const count = err.unresolvedShiftIds.length
          throw new Error(`${err.error} (${count} shift${count !== 1 ? "s" : ""} blocking generation)`)
        }
        throw new Error(err.error || "Failed to generate payroll")
      }
      // Reset and close
      setGenStaff("")
      setGenPeriodStart("")
      setGenPeriodEnd("")
      setGenBonus("")
      setGenNotes("")
      setGenPreview(null)
      setIsGenerateOpen(false)
      fetchPayrollEntries()
    } catch (error) {
      console.error("Error generating payroll:", error)
      const msg = error instanceof Error ? error.message : "Failed to generate payroll"
      alert(msg)
    } finally {
      setGenCreating(false)
    }
  }

  const fetchGenAllPreview = async () => {
    if (!genAllStart || !genAllEnd) return
    setGenAllLoading(true)
    setGenAllPreview(null)
    try {
      const qs = new URLSearchParams({ periodStart: genAllStart, periodEnd: genAllEnd })
      const res = await fetch(`/api/venues/${slug}/payroll/generate-all?${qs}`)
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error)
      }
      const data = await res.json()
      setGenAllPreview(data.members)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to load preview")
    } finally {
      setGenAllLoading(false)
    }
  }

  const handleGenAll = async () => {
    if (!genAllStart || !genAllEnd) return
    setGenAllCreating(true)
    try {
      const res = await fetch(`/api/venues/${slug}/payroll/generate-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodStart: genAllStart, periodEnd: genAllEnd }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error)
      }
      setIsGenAllOpen(false)
      setGenAllStart("")
      setGenAllEnd("")
      setGenAllPreview(null)
      fetchPayrollEntries()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to generate payroll")
    } finally {
      setGenAllCreating(false)
    }
  }

  const genEstimatedTotal = genPreview
    ? (genPreview.summary.estimatedTotal ?? 0) + (genBonus ? parseFloat(genBonus) || 0 : 0)
    : 0

  const staffForMembership = (membershipId: number) => staff.find((s) => String(s.id) === String(membershipId))
  const displayNameForMembership = (membershipId: number) => {
    const s = staffForMembership(membershipId)
    return s
      ? resolveDisplayName({
          characterName: s.user?.characters?.[0]?.characterName,
          nickname: s.nickname,
          displayName: s.user?.displayName,
          discordName: s.user?.name,
        })
      : `Member #${membershipId}`
  }

  const calculateTotal = () => {
    let total = parseFloat(baseRate) || 0

    if (paymentType === "HOURLY" && hoursWorked) {
      total = (parseFloat(baseRate) || 0) * (parseFloat(hoursWorked) || 0)
    }

    if (bonusAmount) {
      total += parseFloat(bonusAmount) || 0
    }

    return Math.round(total).toLocaleString()
  }

  if (loading) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner">
          <PageLoading text="Loading payroll..." />
        </div>
      </VenueLayoutClient>
    )
  }

  const filteredEntries = payrollEntries

  const unpaidTotal = payrollEntries.filter((e) => !e.isPaid).reduce((sum, e) => sum + parseFloat(e.totalAmount), 0)

  const paidTotal = payrollEntries.filter((e) => e.isPaid).reduce((sum, e) => sum + parseFloat(e.totalAmount), 0)

  return (
    <VenueLayoutClient slug={slug}>
      <div className="page-inner space-y-6">
        {/* Breadcrumb */}
        {/* Header */}
        <div className="head-row">
          <div>
            <VenueEyebrow slug={slug} />
            <h1 className="page-h1">Payroll</h1>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {/* Generate All from Shifts */}
            <Dialog
              open={isGenAllOpen}
              onOpenChange={(open) => {
                setIsGenAllOpen(open)
                if (!open) {
                  setGenAllStart("")
                  setGenAllEnd("")
                  setGenAllPreview(null)
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Users className="mr-2 h-4 w-4" />
                  Generate All
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Generate Payroll for All Members</DialogTitle>
                  <DialogDescription>
                    Creates entries for every member with completed unpaid shifts in this period
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Period Start</Label>
                      <Input
                        type="date"
                        value={genAllStart}
                        onChange={(e) => {
                          setGenAllStart(e.target.value)
                          setGenAllPreview(null)
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Period End</Label>
                      <Input
                        type="date"
                        value={genAllEnd}
                        onChange={(e) => {
                          setGenAllEnd(e.target.value)
                          setGenAllPreview(null)
                        }}
                      />
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={fetchGenAllPreview}
                    disabled={!genAllStart || !genAllEnd || genAllLoading}
                  >
                    {genAllLoading ? "Loading..." : "Preview"}
                  </Button>

                  {genAllPreview && (
                    <div className="space-y-2">
                      {genAllPreview.filter((m) => !m.skipped).length === 0 && (
                        <p className="text-sm text-center text-muted-foreground py-4">
                          No eligible members with shifts and rates in this period.
                        </p>
                      )}
                      {genAllPreview
                        .filter((m) => !m.skipped)
                        .map((m) => {
                          const name = displayNameForMembership(m.membershipId)
                          const image = staffForMembership(m.membershipId)?.user?.image ?? null
                          return (
                            <div
                              key={m.membershipId}
                              className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <Avatar className="w-6 h-6">
                                  <AvatarImage src={image || undefined} />
                                  <AvatarFallback className="text-[0.6rem]">{name[0]}</AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{name}</span>
                                <span className="text-muted-foreground">
                                  {m.shiftCount} shift{m.shiftCount !== 1 ? "s" : ""} · {formatHours(m.totalHours)}h
                                  {m.entryCount > 1 && <span> · {m.entryCount} entries</span>}
                                </span>
                              </div>
                              <span className="font-semibold text-[var(--xiv-blue)]">
                                {m.estimatedTotal?.toLocaleString()} gil
                              </span>
                            </div>
                          )
                        })}
                      {genAllPreview.filter((m) => m.skipped).length > 0 && (
                        <div className="pt-2 border-t border-border">
                          <p className="text-xs text-muted-foreground mb-1">Skipped</p>
                          {genAllPreview
                            .filter((m) => m.skipped)
                            .map((m) => (
                              <div
                                key={m.membershipId}
                                className="flex items-center justify-between p-2 text-xs text-muted-foreground"
                              >
                                <span>{displayNameForMembership(m.membershipId)}</span>
                                <span>{m.skipReason === "no_shifts" ? "No shifts" : "No rate set"}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsGenAllOpen(false)} disabled={genAllCreating}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleGenAll}
                    disabled={!genAllPreview || genAllPreview.filter((m) => !m.skipped).length === 0 || genAllCreating}
                  >
                    {genAllCreating
                      ? "Generating..."
                      : `Generate (${genAllPreview?.filter((m) => !m.skipped).length ?? 0} members)`}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={isGenerateOpen}
              onOpenChange={(open) => {
                setIsGenerateOpen(open)
                if (!open) {
                  setGenPreview(null)
                  setGenStaff("")
                  setGenPeriodStart("")
                  setGenPeriodEnd("")
                  setGenBonus("")
                  setGenNotes("")
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Zap className="mr-2 h-4 w-4" />
                  Generate from Shifts
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Generate Payroll from Shifts</DialogTitle>
                  <DialogDescription>Automatically calculate pay from completed, unpaid shifts</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Staff Selection */}
                  <div className="space-y-2">
                    <Label>Staff Member</Label>
                    <Select
                      value={genStaff}
                      onValueChange={(v) => {
                        setGenStaff(v)
                        setGenPreview(null)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select staff member" />
                      </SelectTrigger>
                      <SelectContent>
                        {staff.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {resolveDisplayName({
                              characterName: member.user?.characters?.[0]?.characterName,
                              nickname: member.nickname,
                              displayName: member.user?.displayName,
                              discordName: member.user?.name,
                            })}
                            {member.hourlyRate ? ` (${member.hourlyRate} Gil/hr)` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date Range */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Period Start</Label>
                      <Input
                        type="date"
                        value={genPeriodStart}
                        onChange={(e) => {
                          setGenPeriodStart(e.target.value)
                          setGenPreview(null)
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Period End</Label>
                      <Input
                        type="date"
                        value={genPeriodEnd}
                        onChange={(e) => {
                          setGenPeriodEnd(e.target.value)
                          setGenPreview(null)
                        }}
                      />
                    </div>
                  </div>

                  {/* Preview Button */}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={fetchGeneratePreview}
                    disabled={!genStaff || !genPeriodStart || !genPeriodEnd || genLoading}
                  >
                    {genLoading ? "Loading..." : "Preview Shifts"}
                  </Button>

                  {/* Preview Results */}
                  {genPreview && (
                    <>
                      {genPreview.shifts.length === 0 ? (
                        <div className="p-4 bg-muted rounded-lg text-center text-muted-foreground">
                          No unpaid completed shifts found in this period
                        </div>
                      ) : (
                        <>
                          {/* Shift List */}
                          <div className="space-y-2">
                            <Label>
                              {genPreview.summary.shiftCount} Shift{genPreview.summary.shiftCount !== 1 ? "s" : ""}{" "}
                              Found
                            </Label>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                              {genPreview.shifts.map((shift) => (
                                <div
                                  key={shift.id}
                                  className="flex justify-between items-center p-2 bg-muted rounded text-sm"
                                >
                                  <span>
                                    {format(new Date(shift.actualStart!), "MMM d, h:mm a")} –{" "}
                                    {format(new Date(shift.actualEnd!), "h:mm a")}
                                  </span>
                                  <span className="font-mono">{formatHours(shift.hoursWorked)}h</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Bonus */}
                          <div className="space-y-2">
                            <Label>Bonus (Optional)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0"
                              value={genBonus}
                              onChange={(e) => setGenBonus(e.target.value)}
                            />
                          </div>

                          {/* Notes */}
                          <div className="space-y-2">
                            <Label>Notes (Optional)</Label>
                            <Textarea
                              placeholder="Add any notes..."
                              value={genNotes}
                              onChange={(e) => setGenNotes(e.target.value)}
                            />
                          </div>

                          {/* Summary */}
                          <div className="p-4 bg-muted rounded-lg space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>Total Hours</span>
                              <span className="font-mono">{formatHours(genPreview.summary.totalHours)}h</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>Rate</span>
                              <span className="font-mono">Resolved per shift</span>
                            </div>
                            {genPreview.summary.entryCount > 1 && (
                              <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Entries</span>
                                <span className="font-mono">
                                  {genPreview.summary.entryCount} (different rates in this period)
                                </span>
                              </div>
                            )}
                            {genBonus && parseFloat(genBonus) > 0 && (
                              <div className="flex justify-between text-sm">
                                <span>Bonus</span>
                                <span className="font-mono">+{parseFloat(genBonus)} Gil</span>
                              </div>
                            )}
                            <div className="flex justify-between font-semibold pt-2 border-t border-border">
                              <span>Total</span>
                              <span className="text-lg">{Math.round(genEstimatedTotal).toLocaleString()} Gil</span>
                            </div>
                          </div>
                          {genPreview.summary.unresolvedShiftCount > 0 && (
                            <p className="text-xs text-destructive">
                              Blocked: {genPreview.summary.unresolvedShiftCount} shift
                              {genPreview.summary.unresolvedShiftCount !== 1 ? "s" : ""} in this period{" "}
                              {genPreview.summary.unresolvedShiftCount !== 1 ? "have" : "has"} no resolvable rate (no
                              role rate on the shift, no personal rate, no primary role rate). Set a rate on the
                              position or member before generating.
                            </p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsGenerateOpen(false)} disabled={genCreating}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleGeneratePayroll}
                    disabled={
                      !genPreview ||
                      genPreview.shifts.length === 0 ||
                      genPreview.summary.unresolvedShiftCount > 0 ||
                      genCreating
                    }
                  >
                    {genCreating ? "Generating..." : `Generate (${genPreview?.summary.shiftCount || 0} shifts)`}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Payroll Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Payroll Entry</DialogTitle>
                  <DialogDescription>Add a new payroll entry for a staff member</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Staff Selection */}
                  <div className="space-y-2">
                    <Label>Staff Member</Label>
                    <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select staff member" />
                      </SelectTrigger>
                      <SelectContent>
                        {staff.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {resolveDisplayName({
                              characterName: member.user?.characters?.[0]?.characterName,
                              nickname: member.nickname,
                              displayName: member.user?.displayName,
                              discordName: member.user?.name,
                            })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Payment Type */}
                  <div className="space-y-2">
                    <Label>Payment Type</Label>
                    <Select
                      value={paymentType}
                      onValueChange={(value) => setPaymentType(value as "FIXED_SALARY" | "HOURLY")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FIXED_SALARY">Fixed Salary</SelectItem>
                        <SelectItem value="HOURLY">Hourly Rate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Base Rate */}
                  <div className="space-y-2">
                    <Label>{paymentType === "HOURLY" ? "Hourly Rate" : "Fixed Amount"}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={baseRate}
                      onChange={(e) => setBaseRate(e.target.value)}
                    />
                  </div>

                  {/* Hours Worked (Hourly only) */}
                  {paymentType === "HOURLY" && (
                    <div className="space-y-2">
                      <Label>Hours Worked</Label>
                      <Input
                        type="number"
                        step="0.25"
                        placeholder="0.00"
                        value={hoursWorked}
                        onChange={(e) => setHoursWorked(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Bonus Amount */}
                  <div className="space-y-2">
                    <Label>Bonus (Optional)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={bonusAmount}
                      onChange={(e) => setBonusAmount(e.target.value)}
                    />
                  </div>

                  {/* Period */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Period Start</Label>
                      <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Period End</Label>
                      <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label>Notes (Optional)</Label>
                    <Textarea
                      placeholder="Add any additional notes..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  {/* Total Preview */}
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Total Amount:</span>
                      <span className="text-2xl font-bold">{calculateTotal()} Gil</span>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isCreating}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreatePayroll}
                    disabled={!selectedStaff || !baseRate || !periodStart || !periodEnd || isCreating}
                  >
                    {isCreating ? "Creating..." : "Create Entry"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary Cards */}
        {/* KPIs — matches prototype: Period payout / Pending / Tips pooled / Paid */}
        <div className="kpis">
          <Card className="px-[18px] py-4">
            <StatReadout
              label="Period payout"
              value={`${Math.round(unpaidTotal + paidTotal).toLocaleString()} gil`}
              subtext={`${payrollEntries.length} staff`}
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <circle cx="12" cy="12" r="2" />
                  <path d="M6 12h.01M18 12h.01" />
                </svg>
              }
              iconVariant="blue"
            />
          </Card>
          <Card className="px-[18px] py-4">
            <StatReadout
              label="Pending"
              value={payrollEntries.filter((e) => !e.isPaid).length}
              subtext="awaiting run"
              deltaDirection="down"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 2v20M19 2v20M12 2v4M12 18v4M5 12h7M12 12h7M5 2h14M5 22h14" />
                </svg>
              }
              iconVariant="warning"
            />
          </Card>
          <Card className="px-[18px] py-4">
            <StatReadout
              label="Tips pooled"
              value={tipsTotal > 0 ? `${tipsTotal.toLocaleString()} gil` : "—"}
              subtext="split by hours"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              }
              iconVariant="warning"
            />
          </Card>
          <Card className="px-[18px] py-4">
            <StatReadout
              label="Paid"
              value={payrollEntries.filter((e) => e.isPaid).length}
              subtext={`${Math.round(paidTotal).toLocaleString()} gil`}
              deltaDirection="up"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              }
              iconVariant="success"
            />
          </Card>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full p-1 w-fit">
            {(["all", "unpaid", "paid"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-colors capitalize ${
                  filter === f
                    ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
                }`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                <span className={`ml-1.5 text-[0.68rem] ${filter === f ? "opacity-70" : "text-[var(--fg-faint)]"}`}>
                  {f === "all"
                    ? payrollEntries.length
                    : f === "paid"
                      ? payrollEntries.filter((e) => e.isPaid).length
                      : payrollEntries.filter((e) => !e.isPaid).length}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-36 h-8 text-xs"
              placeholder="From"
            />
            <span>–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-36 h-8 text-xs"
              placeholder="To"
            />
            {(dateFrom !== defaultDateFrom() || dateTo !== defaultDateTo()) && (
              <button
                onClick={() => {
                  setDateFrom(defaultDateFrom())
                  setDateTo(defaultDateTo())
                }}
                className="text-xs text-[var(--fg-faint)] hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Payroll table */}
        <div className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] overflow-hidden">
          {filteredEntries.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">No payroll entries found.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Staff", "Period", "Hours", "Total", "Status", ""].map((h, i) => (
                    <th
                      key={h || i}
                      className={`text-left text-[0.68rem] font-medium uppercase tracking-[0.06em] text-[var(--xiv-blue)] px-5 py-3 border-b border-[var(--blue-008)] whitespace-nowrap ${
                        i === 2 ? "hidden md:table-cell" : ""
                      } ${i === 5 ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const name =
                    entry.membershipId !== null ? displayNameForMembership(entry.membershipId) : "Unknown"
                  const image = entry.membershipId !== null ? staffForMembership(entry.membershipId)?.user?.image : null
                  const initials = name.charAt(0).toUpperCase()
                  const total = Math.round(parseFloat(entry.totalAmount))
                  return (
                    <Fragment key={entry.id}>
                      <tr className="border-b border-[var(--blue-008)] last:border-0 hover:bg-[var(--blue-004)] transition-colors">
                        {/* Staff */}
                        <td className="xiv-td">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={image || undefined} />
                              <AvatarFallback className="text-[0.65rem] font-bold bg-gradient-to-br from-[var(--xiv-blue)] to-blue-700 text-white">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{name}</p>
                            </div>
                          </div>
                        </td>
                        {/* Period */}
                        <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(entry.periodStart), "d MMM")} – {format(new Date(entry.periodEnd), "d MMM")}
                        </td>
                        {/* Hours */}
                        <td className="px-5 py-3.5 text-sm text-muted-foreground hidden md:table-cell">
                          {entry.hoursWorked ? `${formatHours(Number(entry.hoursWorked))}h` : "—"}
                        </td>
                        {/* Total */}
                        <td className="xiv-td">
                          <span className="text-sm font-semibold font-[var(--font-outfit)] text-[var(--xiv-blue)]">
                            {total.toLocaleString()} gil
                          </span>
                          {entry.bonusAmount && parseFloat(entry.bonusAmount) > 0 && (
                            <p className="text-[0.68rem] text-emerald-400">
                              +{parseFloat(entry.bonusAmount).toLocaleString()} bonus
                            </p>
                          )}
                          {(entry.paymentType === "POT_SHARE" || entry.paymentType === "CONTRACTOR_PAYOUT") &&
                            entry.potDistribution && (
                              <button
                                type="button"
                                className="block text-[0.68rem] text-[var(--fg-faint)] underline hover:text-[var(--xiv-blue)] mt-1"
                                onClick={() => toggleExpanded(entry.id)}
                              >
                                {expandedEntryIds.has(entry.id) ? "Hide" : "Show"} breakdown
                              </button>
                            )}
                        </td>
                        {/* Status */}
                        <td className="xiv-td">
                          {entry.isPaid ? (
                            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.04em] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Paid
                            </span>
                          ) : (
                            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.04em] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Pending
                            </span>
                          )}
                        </td>
                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant={entry.isPaid ? "outline" : "default"}
                              size="sm"
                              onClick={() => handleMarkAsPaid(entry.id, entry.isPaid)}
                              disabled={updatingId === entry.id}
                              className="text-xs"
                            >
                              {updatingId === entry.id ? "…" : entry.isPaid ? "Mark unpaid" : "Mark paid"}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-[var(--fg-faint)] hover:text-destructive"
                                  disabled={updatingId === entry.id}
                                  aria-label="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                {entry.isPaid ? (
                                  <>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Can&apos;t delete a paid entry</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Paid entries can&apos;t be deleted. Mark this as unpaid first, then you&apos;ll
                                        be able to delete it.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Got it</AlertDialogCancel>
                                    </AlertDialogFooter>
                                  </>
                                ) : (
                                  <>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete this payroll entry?</AlertDialogTitle>
                                      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteEntry(entry.id)}>
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </>
                                )}
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                      {expandedEntryIds.has(entry.id) && entry.potDistribution && (
                        <tr className="border-b border-[var(--blue-008)] last:border-0 bg-[var(--blue-004)]">
                          <td colSpan={6} className="px-5 py-3 text-xs text-muted-foreground">
                            Regular sales: {Number(entry.potDistribution.regularSales).toLocaleString()} gil
                            {" · "}Contractor sales: {Number(entry.potDistribution.contractorSales).toLocaleString()}{" "}
                            gil
                            {" · "}Pooled tips: {Number(entry.potDistribution.pooledTips).toLocaleString()} gil
                            {" · "}Pot total: {Number(entry.potDistribution.potTotal).toLocaleString()} gil
                            {" · "}Recipients: {entry.potDistribution.recipientCount}
                            {" · "}Per person: {Number(entry.potDistribution.perPersonShare).toLocaleString()} gil
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </VenueLayoutClient>
  )
}
