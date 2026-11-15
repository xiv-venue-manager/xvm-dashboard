"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { REPEATABILITY_LABELS } from "@/lib/vips"
import { useMounted } from "@/lib/use-mounted"
import type { VipPerkStanding, VipRedemptionRow, VipRow } from "@/lib/api/xvm-api"

export interface VipRedeemProps {
  venueId: string
  vips: VipRow[]
}

function Member({ venueId, vip }: { venueId: string; vip: VipRow }) {
  const [perks, setPerks] = useState<VipPerkStanding[] | null>(null)
  const [redemptions, setRedemptions] = useState<VipRedemptionRow[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const mounted = useMounted()
  const params = { venueId, vipId: vip.id }

  useEffect(() => {
    let current = true
    Promise.all([
      apiRoute<VipPerkStanding[]>("/api/venues/[venueId]/vips/[vipId]/perks", { params: { venueId, vipId: vip.id } }),
      apiRoute<VipRedemptionRow[]>("/api/venues/[venueId]/vips/[vipId]/redemptions", { params: { venueId, vipId: vip.id } }),
    ])
      .then(([p, r]) => {
        if (!current) return
        setPerks(p)
        setRedemptions(r)
      })
      .catch((e) => {
        if (current) setFailed(e instanceof ApiError ? e.message : "Couldn't load this VIP's perks.")
      })
    return () => {
      current = false
    }
  }, [venueId, vip.id])

  async function reload() {
    const [p, r] = await Promise.all([
      apiRoute<VipPerkStanding[]>("/api/venues/[venueId]/vips/[vipId]/perks", { params }),
      apiRoute<VipRedemptionRow[]>("/api/venues/[venueId]/vips/[vipId]/redemptions", { params }),
    ])
    setPerks(p)
    setRedemptions(r)
  }

  async function redeem(perk: VipPerkStanding) {
    setBusy(true)
    try {
      await apiRoute("/api/venues/[venueId]/vips/[vipId]/redeem", {
        params,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perkId: perk.perk.id, note }),
      })
      setNote("")
      await reload()
      toast.success(`${perk.perk.name} redeemed.`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to redeem the perk.")
    } finally {
      setBusy(false)
    }
  }

  async function fulfill(redemption: VipRedemptionRow) {
    setBusy(true)
    try {
      await apiRoute("/api/venues/[venueId]/vips/redemptions/[redemptionId]/fulfill", {
        params: { venueId, redemptionId: redemption.id },
        method: "POST",
      })
      await reload()
      toast.success("Marked fulfilled.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to mark it fulfilled.")
    } finally {
      setBusy(false)
    }
  }

  if (failed) return <p className="text-sm text-destructive">{failed}</p>
  if (perks === null || redemptions === null) return <p className="text-sm text-muted-foreground">Loading...</p>

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="vip-redeem-note">Note for the redemption</Label>
        <Input id="vip-redeem-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} disabled={busy} className="max-w-sm" />
      </div>
      {perks.length === 0 ? (
        <p className="text-sm text-muted-foreground">This tier has no perks.</p>
      ) : (
        <ul className="space-y-3">
          {perks.map((standing) => (
            <li key={standing.perk.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-[10rem] flex-1">
                <p className="text-sm font-medium">{standing.perk.name}</p>
                <p className="text-xs text-muted-foreground">
                  {REPEATABILITY_LABELS[standing.perk.repeatability]}
                  {!standing.redeemable && standing.free_at && mounted ? `, available again ${format(new Date(standing.free_at), "PPp")}` : ""}
                  {!standing.redeemable && !standing.free_at ? ", already used" : ""}
                </p>
              </div>
              <Button size="sm" disabled={busy || !standing.redeemable} onClick={() => redeem(standing)}>
                Redeem
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2 border-t pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Redemptions</p>
        {redemptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing redeemed yet.</p>
        ) : (
          <ul className="space-y-2">
            {redemptions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>
                  {r.perk_name}
                  {r.note ? <span className="text-muted-foreground">, {r.note}</span> : null}
                  {mounted && <span className="text-muted-foreground">, {format(new Date(r.redeemed_at), "PPp")}</span>}
                </span>
                {r.fulfilled_at ? (
                  <span className="text-xs text-muted-foreground">Fulfilled</span>
                ) : (
                  <Button size="sm" variant="outline-blue" disabled={busy} onClick={() => fulfill(r)}>
                    Mark fulfilled
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function VipRedeem({ venueId, vips }: VipRedeemProps) {
  const active = vips.filter((vip) => vip.ended_at === null && vip.is_active)
  const [vipId, setVipId] = useState("")
  const selected = active.find((vip) => String(vip.id) === vipId) ?? null

  if (active.length === 0) return <p className="text-sm text-muted-foreground">There are no active VIPs.</p>

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="space-y-2">
          <Label htmlFor="vip-redeem-who">VIP</Label>
          <Select value={vipId} onValueChange={setVipId}>
            <SelectTrigger id="vip-redeem-who" className="w-72">
              <SelectValue placeholder="Choose a VIP" />
            </SelectTrigger>
            <SelectContent>
              {active.map((vip) => (
                <SelectItem key={vip.id} value={String(vip.id)}>
                  {vip.person_name}, {vip.tier_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selected && <Member key={selected.id} venueId={venueId} vip={selected} />}
      </CardContent>
    </Card>
  )
}
