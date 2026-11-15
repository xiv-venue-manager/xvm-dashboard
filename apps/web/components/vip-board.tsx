"use client"

import { useState } from "react"
import { PillToggle } from "@/components/pill-toggle"
import { VipMembers } from "@/components/vip-members"
import { VipRedeem } from "@/components/vip-redeem"
import { VipTiers } from "@/components/vip-tiers"
import { VipSettingsPanel } from "@/components/vip-settings"
import type { VipPostRow, VipRow, VipSettings, VipTierRow } from "@/lib/api/xvm-api"

type View = "vips" | "redeem" | "tiers" | "settings"

export interface VipBoardProps {
  venueId: string
  canManage: boolean
  vips: VipRow[]
  tiers: VipTierRow[]
  settings: VipSettings
  posts: VipPostRow[]
}

export function VipBoard({ venueId, canManage, vips: initialVips, tiers: initialTiers, settings, posts }: VipBoardProps) {
  const [view, setView] = useState<View>("vips")
  const [vips, setVips] = useState(initialVips)
  const [tiers, setTiers] = useState(initialTiers)

  const views: ReadonlyArray<{ id: View; label: string }> = canManage
    ? [
        { id: "vips", label: "VIPs" },
        { id: "redeem", label: "Redeem perks" },
        { id: "tiers", label: "Tiers and perks" },
        { id: "settings", label: "Settings" },
      ]
    : [
        { id: "vips", label: "VIPs" },
        { id: "redeem", label: "Redeem perks" },
      ]

  return (
    <div className="space-y-4">
      <PillToggle label="VIP view" options={views} value={view} onChange={setView} />

      {view === "vips" && <VipMembers venueId={venueId} canManage={canManage} vips={vips} tiers={tiers} onChange={setVips} />}
      {view === "redeem" && <VipRedeem venueId={venueId} vips={vips} />}
      {canManage && view === "tiers" && <VipTiers venueId={venueId} tiers={tiers} onChange={setTiers} />}
      {canManage && view === "settings" && <VipSettingsPanel venueId={venueId} settings={settings} posts={posts} />}
    </div>
  )
}
