"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface FinanceCategoriesSettingsProps {
  venueSlug: string
}

interface FinanceCategoryRow {
  id: number
  name: string
  sort_order: number
  applies_to: "revenue" | "expense" | "payout" | null
}

const APPLIES_TO_OPTIONS: { value: "revenue" | "expense" | "payout" | ""; label: string }[] = [
  { value: "", label: "Any" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
  { value: "payout", label: "Payout" },
]

const ANY = "any"

export function FinanceCategoriesSettings({ venueSlug }: FinanceCategoriesSettingsProps) {
  const [categories, setCategories] = useState<FinanceCategoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [newAppliesTo, setNewAppliesTo] = useState<"revenue" | "expense" | "payout" | "">("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/venues/${venueSlug}/finance-categories`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load categories"))))
      .then((data: FinanceCategoryRow[]) => {
        if (!cancelled) setCategories(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [venueSlug])

  async function handleAdd() {
    if (!newName.trim()) return
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/venues/${venueSlug}/finance-categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          applies_to: newAppliesTo || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || "Failed to create category")
      }
      const created: FinanceCategoryRow = await res.json()
      setCategories((prev) => [...prev, created])
      setNewName("")
      setNewAppliesTo("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(categoryId: number) {
    setError(null)
    try {
      const res = await fetch(`/api/venues/${venueSlug}/finance-categories/${categoryId}`, { method: "DELETE" })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || "Failed to delete category")
      }
      setCategories((prev) => prev.filter((c) => c.id !== categoryId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category")
    }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading categories...</div>

  return (
    <div className="space-y-3">
      {error && <div className="text-sm text-destructive">{error}</div>}
      <ul className="space-y-1">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {category.name}
              {category.applies_to && <span className="text-muted-foreground"> ({category.applies_to})</span>}
            </span>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(category.id)}>
              Remove
            </Button>
          </li>
        ))}
        {categories.length === 0 && <li className="text-sm text-muted-foreground">No categories yet</li>}
      </ul>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          maxLength={50}
          className="h-9 flex-1"
        />
        <Select
          value={newAppliesTo || ANY}
          onValueChange={(value) => setNewAppliesTo((value === ANY ? "" : value) as "revenue" | "expense" | "payout" | "")}
        >
          <SelectTrigger className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APPLIES_TO_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value || ANY}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={isSaving || !newName.trim()} onClick={handleAdd}>
          Add
        </Button>
      </div>
    </div>
  )
}
