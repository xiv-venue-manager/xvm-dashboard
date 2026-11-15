"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
import { UserPicker } from "@/components/user-picker"
import { useResolvedMembers } from "@/components/discord-members"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { endOfDayIso, isoToDay, vipTimeLeft } from "@/lib/vips"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import { useMounted } from "@/lib/use-mounted"
import type { VipRow, VipTierRow } from "@/lib/api/xvm-api"

export interface VipMembersProps {
  venueId: string
  canManage: boolean
  vips: VipRow[]
  tiers: VipTierRow[]
  onChange: (vips: VipRow[]) => void
}

function Grant({ venueId, tiers, onGranted }: { venueId: string; tiers: VipTierRow[]; onGranted: (vip: VipRow) => void }) {
  const [userId, setUserId] = useState("")
  const [tierId, setTierId] = useState(tiers[0] ? String(tiers[0].id) : "")
  const [day, setDay] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const members = useResolvedMembers(venueId, userId === "" ? [] : [userId])

  async function grant() {
    if (!SNOWFLAKE_PATTERN.test(userId)) {
      toast.error("Pick the person to make a VIP.")
      return
    }
    if (tierId === "") {
      toast.error("Make a tier first.")
      return
    }
    const expiresAt = day === "" ? undefined : endOfDayIso(day)
    if (expiresAt === null) {
      toast.error("That expiry date is not valid.")
      return
    }
    setBusy(true)
    try {
      const vip = await apiRoute<VipRow>("/api/venues/[venueId]/vips", {
        params: { venueId },
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discordUserId: userId,
          displayName: members[userId]?.displayName ?? userId,
          tierId: Number(tierId),
          ...(expiresAt !== undefined && { expiresAt }),
          ...(notes.trim() !== "" && { notes: notes.trim() }),
        }),
      })
      onGranted(vip)
      setUserId("")
      setDay("")
      setNotes("")
      toast.success(`${vip.person_name} is now a VIP.`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to grant VIP status.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <p className="font-semibold">Grant VIP status</p>
        <div className="space-y-2">
          <Label htmlFor="vip-grant-user">Person</Label>
          <UserPicker venueId={venueId} value={userId} onChange={setUserId} disabled={busy} id="vip-grant-user" />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <Label htmlFor="vip-grant-tier">Tier</Label>
            <Select value={tierId} onValueChange={setTierId} disabled={busy || tiers.length === 0}>
              <SelectTrigger id="vip-grant-tier" className="w-48">
                <SelectValue placeholder="No tiers yet" />
              </SelectTrigger>
              <SelectContent>
                {tiers.map((tier) => (
                  <SelectItem key={tier.id} value={String(tier.id)}>
                    {tier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vip-grant-expiry">Expires on</Label>
            <Input id="vip-grant-expiry" type="date" value={day} onChange={(e) => setDay(e.target.value)} disabled={busy} className="w-44" />
            <p className="text-xs text-muted-foreground">Leave empty for a lifetime VIP.</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="vip-grant-notes">Notes</Label>
          <Input id="vip-grant-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
        </div>
        <Button onClick={grant} disabled={busy}>
          {busy ? "Granting..." : "Grant VIP"}
        </Button>
      </CardContent>
    </Card>
  )
}

function Manage({
  venueId,
  vip,
  tiers,
  onSaved,
  onEnd,
}: {
  venueId: string
  vip: VipRow
  tiers: VipTierRow[]
  onSaved: (vip: VipRow) => void
  onEnd: () => void
}) {
  const [day, setDay] = useState(isoToDay(vip.expires_at))
  const [notes, setNotes] = useState(vip.notes ?? "")
  const [tierId, setTierId] = useState(vip.tier_id === null ? "" : String(vip.tier_id))
  const [busy, setBusy] = useState(false)
  const params = { venueId, vipId: vip.id }

  async function saveDetails() {
    const expiresAt = day === "" ? null : endOfDayIso(day)
    if (day !== "" && expiresAt === null) {
      toast.error("That expiry date is not valid.")
      return
    }
    setBusy(true)
    try {
      onSaved(
        await apiRoute<VipRow>("/api/venues/[venueId]/vips/[vipId]", {
          params,
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiresAt, notes }),
        })
      )
      toast.success("VIP saved.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save the VIP.")
    } finally {
      setBusy(false)
    }
  }

  async function moveTier() {
    setBusy(true)
    try {
      onSaved(
        await apiRoute<VipRow>("/api/venues/[venueId]/vips/[vipId]/reassign", {
          params,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tierId: Number(tierId) }),
        })
      )
      toast.success("Tier changed.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to change the tier.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor={`vip-expiry-${vip.id}`}>Expires on</Label>
          <Input id={`vip-expiry-${vip.id}`} type="date" value={day} onChange={(e) => setDay(e.target.value)} disabled={busy} className="w-44" />
        </div>
        <div className="min-w-[12rem] flex-1 space-y-2">
          <Label htmlFor={`vip-notes-${vip.id}`}>Notes</Label>
          <Input id={`vip-notes-${vip.id}`} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
        </div>
        <Button size="sm" onClick={saveDetails} disabled={busy}>
          Save
        </Button>
        {day !== "" && (
          <Button size="sm" variant="outline" onClick={() => setDay("")} disabled={busy}>
            Make lifetime
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor={`vip-tier-${vip.id}`}>Tier</Label>
          <Select value={tierId} onValueChange={setTierId} disabled={busy}>
            <SelectTrigger id={`vip-tier-${vip.id}`} className="w-48">
              <SelectValue placeholder={vip.tier_name} />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((tier) => (
                <SelectItem key={tier.id} value={String(tier.id)}>
                  {tier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline-blue" onClick={moveTier} disabled={busy || tierId === "" || Number(tierId) === vip.tier_id}>
          Move to this tier
        </Button>
        <Button size="sm" variant="outline" onClick={onEnd} disabled={busy}>
          End VIP
        </Button>
      </div>
    </div>
  )
}

export function VipMembers({ venueId, canManage, vips, tiers, onChange }: VipMembersProps) {
  const [showEnded, setShowEnded] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const [endTarget, setEndTarget] = useState<VipRow | null>(null)
  const [ending, setEnding] = useState(false)
  const mounted = useMounted()
  const now = new Date()

  const shown = vips.filter((vip) => showEnded || vip.ended_at === null)

  const replace = (saved: VipRow) => onChange(vips.map((v) => (v.id === saved.id ? saved : v)))

  async function confirmEnd() {
    if (!endTarget) return
    setEnding(true)
    try {
      replace(await apiRoute<VipRow>("/api/venues/[venueId]/vips/[vipId]/end", { params: { venueId, vipId: endTarget.id }, method: "POST" }))
      setOpen(null)
      toast.success(`${endTarget.person_name}'s VIP status ended.`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to end the VIP.")
    } finally {
      setEnding(false)
      setEndTarget(null)
    }
  }

  return (
    <div className="space-y-4">
      {canManage && <Grant venueId={venueId} tiers={tiers} onGranted={(vip) => onChange([vip, ...vips])} />}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{shown.length} VIPs.</p>
        <div className="flex items-center gap-2">
          <Switch id="vip-show-ended" checked={showEnded} onCheckedChange={setShowEnded} />
          <Label htmlFor="vip-show-ended" className="text-sm">
            Show ended
          </Label>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No VIPs yet.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((vip) => (
            <Card key={vip.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-[10rem] flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{vip.person_name}</p>
                      <Badge variant="tag">{vip.tier_name}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{mounted ? vipTimeLeft(vip, now) : ""}</p>
                    {vip.notes && <p className="text-sm">{vip.notes}</p>}
                  </div>
                  {canManage && vip.ended_at === null && (
                    <Button size="sm" variant="outline-blue" onClick={() => setOpen(open === vip.id ? null : vip.id)}>
                      {open === vip.id ? "Close" : "Manage"}
                    </Button>
                  )}
                </div>
                {canManage && open === vip.id && vip.ended_at === null && (
                  <Manage key={`${vip.id}-${vip.expires_at}-${vip.tier_id}`} venueId={venueId} vip={vip} tiers={tiers} onSaved={replace} onEnd={() => setEndTarget(vip)} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!endTarget} onOpenChange={(next) => !next && setEndTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End {endTarget?.person_name ?? "this"}&apos;s VIP status?</AlertDialogTitle>
            <AlertDialogDescription>They lose the tier&apos;s perks and its Discord role. You can grant VIP status again later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmEnd} disabled={ending}>
              {ending ? "Ending..." : "End VIP"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
