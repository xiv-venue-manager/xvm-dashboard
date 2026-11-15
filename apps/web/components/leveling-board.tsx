"use client"

import { useState } from "react"
import { PillToggle } from "@/components/pill-toggle"
import { LevelingLeaderboard } from "@/components/leveling-leaderboard"
import { LevelingSettings } from "@/components/leveling-settings"
import { LevelingRules } from "@/components/leveling-rules"
import { LevelingTiers } from "@/components/leveling-tiers"
import type {
  LevelingRuleRow,
  LevelingSettings as LevelingSettingsRow,
  LevelingStanding,
  LevelingTierRow,
} from "@/lib/api/xvm-api"

type View = "leaderboard" | "settings" | "rules" | "tiers"

const VIEWS: ReadonlyArray<{ id: View; label: string }> = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "settings", label: "Settings" },
  { id: "rules", label: "Rules" },
  { id: "tiers", label: "Tiers" },
]

export interface LevelingBoardProps {
  venueId: string
  canManage: boolean
  settings: LevelingSettingsRow
  standings: LevelingStanding[]
  rules: LevelingRuleRow[]
  tiers: LevelingTierRow[]
}

export function LevelingBoard({ venueId, canManage, settings: initialSettings, standings, rules: initialRules, tiers: initialTiers }: LevelingBoardProps) {
  const [view, setView] = useState<View>("leaderboard")
  const [settings, setSettings] = useState(initialSettings)
  const [rules, setRules] = useState(initialRules)
  const [tiers, setTiers] = useState(initialTiers)

  const options = canManage ? VIEWS : VIEWS.slice(0, 1)

  return (
    <div className="space-y-4">
      {canManage && <PillToggle label="Leveling view" options={options} value={view} onChange={setView} />}

      {view === "leaderboard" && <LevelingLeaderboard venueId={venueId} xpName={settings.xp_name} standings={standings} />}
      {canManage && view === "settings" && <LevelingSettings venueId={venueId} settings={settings} onSaved={setSettings} />}
      {canManage && view === "rules" && <LevelingRules venueId={venueId} xpName={settings.xp_name} rules={rules} onChange={setRules} />}
      {canManage && view === "tiers" && <LevelingTiers venueId={venueId} tiers={tiers} onChange={setTiers} />}
    </div>
  )
}
