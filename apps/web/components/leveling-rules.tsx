"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { formatCooldown, RULE_SOURCES, sourceLabel, type RuleSource } from "@/lib/leveling"
import type { LevelingRuleRow } from "@/lib/api/xvm-api"

export interface LevelingRulesProps {
  venueId: string
  xpName: string
  rules: LevelingRuleRow[]
  onChange: (rules: LevelingRuleRow[]) => void
}

function wholeNumber(value: string, max: number): number | null {
  if (value.trim() === "") return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null
}

function RuleItem({
  venueId,
  xpName,
  rule,
  onSaved,
  onDeleted,
}: {
  venueId: string
  xpName: string
  rule: LevelingRuleRow
  onSaved: (rule: LevelingRuleRow) => void
  onDeleted: (id: number) => void
}) {
  const [amount, setAmount] = useState(String(rule.xp_amount))
  const [cooldown, setCooldown] = useState(String(rule.cooldown_seconds))
  const [busy, setBusy] = useState(false)

  const amountNumber = wholeNumber(amount, 1_000_000)
  const cooldownNumber = wholeNumber(cooldown, 2_147_483_647)
  const dirty = amount !== String(rule.xp_amount) || cooldown !== String(rule.cooldown_seconds)

  async function patch(body: { xpAmount?: number; cooldownSeconds?: number; enabled?: boolean }, failure: string) {
    setBusy(true)
    try {
      const saved = await apiRoute<LevelingRuleRow>("/api/venues/[venueId]/leveling/rules/[ruleId]", {
        params: { venueId, ruleId: rule.id },
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      onSaved(saved)
      return saved
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : failure)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (amountNumber === null || cooldownNumber === null) {
      toast.error(`The ${xpName} amount is 0 to 1,000,000 and the cooldown is whole seconds.`)
      return
    }
    const saved = await patch({ xpAmount: amountNumber, cooldownSeconds: cooldownNumber }, "Failed to save the rule.")
    if (saved) toast.success("Rule saved.")
  }

  async function remove() {
    setBusy(true)
    try {
      await apiRoute("/api/venues/[venueId]/leveling/rules/[ruleId]", {
        params: { venueId, ruleId: rule.id },
        method: "DELETE",
      })
      onDeleted(rule.id)
      toast.success("Rule removed.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove the rule.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div className="min-w-[10rem] flex-1">
          <p className="font-semibold">{sourceLabel(rule.source_key)}</p>
          <p className="text-xs text-muted-foreground">
            {rule.xp_amount} {xpName}, {formatCooldown(rule.cooldown_seconds).toLowerCase()}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rule-amount-${rule.id}`} className="text-xs">
            {xpName}
          </Label>
          <Input
            id={`rule-amount-${rule.id}`}
            type="number"
            min={0}
            max={1000000}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            className="w-28"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rule-cooldown-${rule.id}`} className="text-xs">
            Cooldown (seconds)
          </Label>
          <Input
            id={`rule-cooldown-${rule.id}`}
            type="number"
            min={0}
            value={cooldown}
            onChange={(e) => setCooldown(e.target.value)}
            disabled={busy}
            className="w-32"
          />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Switch
            checked={rule.enabled}
            onCheckedChange={(enabled) => patch({ enabled }, "Failed to update the rule.")}
            disabled={busy}
            aria-label={`${sourceLabel(rule.source_key)} enabled`}
          />
          <Button size="sm" onClick={save} disabled={!dirty || busy}>
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={remove} disabled={busy}>
            Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function LevelingRules({ venueId, xpName, rules, onChange }: LevelingRulesProps) {
  const unused = RULE_SOURCES.filter((source) => !rules.some((rule) => rule.source_key === source))
  const [source, setSource] = useState<RuleSource | "">("")
  const [amount, setAmount] = useState("5")
  const [cooldown, setCooldown] = useState("0")
  const [adding, setAdding] = useState(false)

  const chosen: RuleSource | "" = source !== "" && unused.includes(source) ? source : (unused[0] ?? "")

  async function add() {
    const xpAmount = wholeNumber(amount, 1_000_000)
    const cooldownSeconds = wholeNumber(cooldown, 2_147_483_647)
    if (chosen === "" || xpAmount === null || cooldownSeconds === null) {
      toast.error(`The ${xpName} amount is 0 to 1,000,000 and the cooldown is whole seconds.`)
      return
    }
    setAdding(true)
    try {
      const created = await apiRoute<LevelingRuleRow>("/api/venues/[venueId]/leveling/rules", {
        params: { venueId },
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKey: chosen, xpAmount, cooldownSeconds }),
      })
      onChange([...rules, created])
      setSource("")
      toast.success("Rule added.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to add the rule.")
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Each rule is one way to earn {xpName}. A source with no rule, or a switched-off one, earns nothing.
      </p>

      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rules yet, so nobody earns {xpName}.</p>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <RuleItem
              key={rule.id}
              venueId={venueId}
              xpName={xpName}
              rule={rule}
              onSaved={(saved) => onChange(rules.map((r) => (r.id === saved.id ? saved : r)))}
              onDeleted={(id) => onChange(rules.filter((r) => r.id !== id))}
            />
          ))}
        </div>
      )}

      {unused.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-5">
            <div className="space-y-1">
              <Label htmlFor="rule-new-source" className="text-xs">
                Source
              </Label>
              <Select value={chosen} onValueChange={(value) => setSource(value as RuleSource)}>
                <SelectTrigger id="rule-new-source" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {unused.map((value) => (
                    <SelectItem key={value} value={value}>
                      {sourceLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-new-amount" className="text-xs">
                {xpName}
              </Label>
              <Input
                id="rule-new-amount"
                type="number"
                min={0}
                max={1000000}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={adding}
                className="w-28"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-new-cooldown" className="text-xs">
                Cooldown (seconds)
              </Label>
              <Input
                id="rule-new-cooldown"
                type="number"
                min={0}
                value={cooldown}
                onChange={(e) => setCooldown(e.target.value)}
                disabled={adding}
                className="w-32"
              />
            </div>
            <Button onClick={add} disabled={adding}>
              {adding ? "Adding..." : "Add rule"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
