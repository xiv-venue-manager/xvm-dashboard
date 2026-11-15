"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RolePicker, useDiscordOptions } from "@/components/discord-picker"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { colorToHex, hexToColor } from "@/lib/audit-log-events"
import { REPEATABILITIES, REPEATABILITY_LABELS } from "@/lib/vips"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import type { PerkRepeatability, VipPerkRow, VipTierRow } from "@/lib/api/xvm-api"

export interface VipTiersProps {
  venueId: string
  tiers: VipTierRow[]
  onChange: (tiers: VipTierRow[]) => void
}

const byOrder = (a: { sort_order: number; id: number }, b: { sort_order: number; id: number }) => a.sort_order - b.sort_order || a.id - b.id

function PerkRowItem({
  venueId,
  perk,
  onSaved,
  onRemoved,
}: {
  venueId: string
  perk: VipPerkRow
  onSaved: (perk: VipPerkRow) => void
  onRemoved: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(perk.name)
  const [description, setDescription] = useState(perk.description ?? "")
  const [repeat, setRepeat] = useState<PerkRepeatability>(perk.repeatability)
  const [busy, setBusy] = useState(false)
  const params = { venueId, perkId: perk.id }

  async function save() {
    if (name.trim() === "") {
      toast.error("A perk needs a name.")
      return
    }
    setBusy(true)
    try {
      const saved = await apiRoute<VipPerkRow>("/api/venues/[venueId]/vips/perks/[perkId]", {
        params,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description, repeatability: repeat }),
      })
      onSaved(saved)
      setEditing(false)
      toast.success("Perk saved.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save the perk.")
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await apiRoute("/api/venues/[venueId]/vips/perks/[perkId]", { params, method: "DELETE" })
      onRemoved(perk.id)
      toast.success("Perk removed.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove the perk.")
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="space-y-3 rounded-md border border-[var(--blue-018)] p-3">
        <Input aria-label="Perk name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} disabled={busy} />
        <Input aria-label="Perk description" placeholder="Description" value={description} maxLength={250} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
        <Select value={repeat} onValueChange={(v) => setRepeat(v as PerkRepeatability)} disabled={busy}>
          <SelectTrigger aria-label="How often it can be claimed" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPEATABILITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {REPEATABILITY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={busy}>
            Save perk
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-[10rem] flex-1">
        <p className="text-sm font-medium">{perk.name}</p>
        <p className="text-xs text-muted-foreground">
          {REPEATABILITY_LABELS[perk.repeatability]}
          {perk.description ? `, ${perk.description}` : ""}
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline-blue" onClick={() => setEditing(true)} disabled={busy}>
          Edit
        </Button>
        <Button size="sm" variant="outline" onClick={remove} disabled={busy}>
          Remove
        </Button>
      </div>
    </div>
  )
}

function NewPerk({ venueId, tierId, onAdded }: { venueId: string; tierId: number; onAdded: (perk: VipPerkRow) => void }) {
  const [name, setName] = useState("")
  const [repeat, setRepeat] = useState<PerkRepeatability>("monthly")
  const [busy, setBusy] = useState(false)

  async function add() {
    if (name.trim() === "") {
      toast.error("A perk needs a name.")
      return
    }
    setBusy(true)
    try {
      const perk = await apiRoute<VipPerkRow>("/api/venues/[venueId]/vips/tiers/[tierId]/perks", {
        params: { venueId, tierId },
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), repeatability: repeat }),
      })
      onAdded(perk)
      setName("")
      toast.success("Perk added.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to add the perk.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <Input aria-label="New perk name" placeholder="New perk" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} disabled={busy} className="max-w-[14rem]" />
      <Select value={repeat} onValueChange={(v) => setRepeat(v as PerkRepeatability)} disabled={busy}>
        <SelectTrigger aria-label="How often the new perk can be claimed" className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REPEATABILITIES.map((value) => (
            <SelectItem key={value} value={value}>
              {REPEATABILITY_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={add} disabled={busy}>
        Add perk
      </Button>
    </div>
  )
}

function TierForm({
  venueId,
  tier,
  onSaved,
  onClose,
}: {
  venueId: string
  tier: VipTierRow | null
  onSaved: (tier: VipTierRow) => void
  onClose?: () => void
}) {
  const [name, setName] = useState(tier?.name ?? "")
  const [description, setDescription] = useState(tier?.description ?? "")
  const [cost, setCost] = useState(String(tier?.cost ?? 0))
  const [color, setColor] = useState(tier?.color == null ? "" : colorToHex(tier.color))
  const [roleId, setRoleId] = useState(tier?.discord_role_id ?? "")
  const [order, setOrder] = useState(String(tier?.sort_order ?? 0))
  const [saving, setSaving] = useState(false)
  const key = tier?.id ?? "new"

  async function save() {
    const gil = Number(cost)
    const place = Number(order)
    if (name.trim() === "") {
      toast.error("Give the tier a name.")
      return
    }
    if (!Number.isInteger(gil) || gil < 0 || !Number.isInteger(place) || place < 0) {
      toast.error("The cost and the place in the order are whole numbers, 0 or more.")
      return
    }
    if (roleId !== "" && !SNOWFLAKE_PATTERN.test(roleId)) {
      toast.error("Role ID must be numeric.")
      return
    }
    const body = JSON.stringify({
      name: name.trim(),
      description,
      cost: gil,
      color: color === "" ? null : hexToColor(color),
      discordRoleId: roleId === "" ? null : roleId,
      sortOrder: place,
    })
    setSaving(true)
    try {
      const saved =
        tier === null
          ? await apiRoute<VipTierRow>("/api/venues/[venueId]/vips/tiers", { params: { venueId }, method: "POST", headers: { "Content-Type": "application/json" }, body })
          : await apiRoute<VipTierRow>("/api/venues/[venueId]/vips/tiers/[tierId]", {
              params: { venueId, tierId: tier.id },
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body,
            })
      onSaved(saved)
      toast.success(tier === null ? "Tier added." : "Tier saved.")
      if (tier === null) {
        setName("")
        setDescription("")
        setCost("0")
        setColor("")
        setRoleId("")
        setOrder("0")
      } else {
        onClose?.()
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save the tier.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`vip-tier-name-${key}`}>Name</Label>
          <Input id={`vip-tier-name-${key}`} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`vip-tier-cost-${key}`}>Cost (gil)</Label>
          <Input id={`vip-tier-cost-${key}`} type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`vip-tier-desc-${key}`}>Description</Label>
          <Input id={`vip-tier-desc-${key}`} value={description} maxLength={250} onChange={(e) => setDescription(e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`vip-tier-color-${key}`}>Colour</Label>
          <div className="flex items-center gap-2">
            <input
              id={`vip-tier-color-${key}`}
              type="color"
              value={color || "#5865f2"}
              onChange={(e) => setColor(e.target.value)}
              disabled={saving}
              className="h-7 w-7 cursor-pointer appearance-none rounded-full border border-[var(--blue-018)] bg-transparent p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
            />
            {color !== "" && (
              <button type="button" onClick={() => setColor("")} className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]">
                No colour
              </button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`vip-tier-order-${key}`}>Place in the order</Label>
          <Input id={`vip-tier-order-${key}`} type="number" min={0} value={order} onChange={(e) => setOrder(e.target.value)} disabled={saving} className="w-28" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Discord role</Label>
          {roleId !== "" && (
            <button type="button" onClick={() => setRoleId("")} className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]">
              No role
            </button>
          )}
        </div>
        <RolePicker venueId={venueId} value={roleId} onChange={setRoleId} disabled={saving} />
      </div>
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : tier === null ? "Add tier" : "Save tier"}
        </Button>
        {onClose && (
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

export function VipTiers({ venueId, tiers, onChange }: VipTiersProps) {
  const [editing, setEditing] = useState<number | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const roles = useDiscordOptions(venueId, "roles", tiers.some((t) => t.discord_role_id !== null))
  const roleName = (id: string) => roles.options.find((o) => o.value === id)?.label ?? id

  const replacePerks = (tier: VipTierRow, perks: VipPerkRow[]) => onChange(tiers.map((t) => (t.id === tier.id ? { ...t, perks } : t)))

  async function remove(tier: VipTierRow) {
    setRemoving(tier.id)
    try {
      await apiRoute("/api/venues/[venueId]/vips/tiers/[tierId]", { params: { venueId, tierId: tier.id }, method: "DELETE" })
      onChange(tiers.filter((t) => t.id !== tier.id))
      toast.success("Tier removed.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove the tier.")
    } finally {
      setRemoving(null)
    }
  }

  const sorted = [...tiers].sort(byOrder)

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tiers yet.</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((tier) => (
            <Card key={tier.id}>
              <CardContent className="space-y-4 p-5">
                {editing === tier.id ? (
                  <TierForm
                    venueId={venueId}
                    tier={tier}
                    onSaved={(saved) => onChange(tiers.map((t) => (t.id === saved.id ? { ...saved, perks: t.perks } : t)))}
                    onClose={() => setEditing(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-[10rem] flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="tag"
                          style={tier.color === null ? undefined : { borderColor: colorToHex(tier.color), color: colorToHex(tier.color) }}
                        >
                          {tier.name}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{tier.cost.toLocaleString()} gil</span>
                      </div>
                      {tier.description && <p className="text-sm">{tier.description}</p>}
                      <p className="text-xs text-muted-foreground">{tier.discord_role_id ? `Role: ${roleName(tier.discord_role_id)}` : "No Discord role"}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline-blue" onClick={() => setEditing(tier.id)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => remove(tier)} disabled={removing === tier.id}>
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
                <div className="space-y-3 border-t pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Perks</p>
                  {[...tier.perks].sort(byOrder).map((perk) => (
                    <PerkRowItem
                      key={perk.id}
                      venueId={venueId}
                      perk={perk}
                      onSaved={(saved) => replacePerks(tier, tier.perks.map((p) => (p.id === saved.id ? saved : p)))}
                      onRemoved={(id) => replacePerks(tier, tier.perks.filter((p) => p.id !== id))}
                    />
                  ))}
                  {tier.perks.length === 0 && <p className="text-sm text-muted-foreground">No perks yet.</p>}
                  <NewPerk venueId={venueId} tierId={tier.id} onAdded={(perk) => replacePerks(tier, [...tier.perks, perk])} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 p-5">
          <p className="font-semibold">New tier</p>
          <TierForm venueId={venueId} tier={null} onSaved={(saved) => onChange([...tiers, { ...saved, perks: saved.perks ?? [] }])} />
        </CardContent>
      </Card>
    </div>
  )
}
