"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

interface FinanceCategoriesSettingsProps {
  venueId: string
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

export function FinanceCategoriesSettings({ venueId }: FinanceCategoriesSettingsProps) {
  const [categories, setCategories] = useState<FinanceCategoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [newAppliesTo, setNewAppliesTo] = useState<"revenue" | "expense" | "payout" | "">("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/venues/${venueId}/finance-categories`)
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
  }, [venueId])

  async function handleAdd() {
    if (!newName.trim()) return
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/finance-categories`, {
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
      const res = await fetch(`/api/venues/${venueId}/finance-categories/${categoryId}`, { method: "DELETE" })
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
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          maxLength={50}
          className="rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none flex-1"
        />
        <select
          value={newAppliesTo}
          onChange={(e) => setNewAppliesTo(e.target.value as "revenue" | "expense" | "payout" | "")}
          className="rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none"
        >
          {APPLIES_TO_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={isSaving || !newName.trim()} onClick={handleAdd}>
          Add
        </Button>
      </div>
    </div>
  )
}
