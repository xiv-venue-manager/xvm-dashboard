"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"

interface ItemSearchResult {
  itemId: number
  name: string
  iconId: number | null
}

interface ItemSearchComboboxProps {
  venueSlug: string
  value: { itemId: number; name: string; iconId: number | null } | null
  onChange: (item: { itemId: number; name: string; iconId: number | null } | null) => void
}

export function ItemSearchCombobox({ venueSlug, value, onChange }: ItemSearchComboboxProps) {
  const [query, setQuery] = useState(value?.name ?? "")
  const [results, setResults] = useState<ItemSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const visibleResults = query.trim().length >= 2 ? results : []

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) return
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/venues/${venueSlug}/inventory/item-search?query=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.items)
        setIsOpen(true)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, venueSlug])

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          if (value) onChange(null)
        }}
        placeholder="Search FFXIV item…"
      />
      {isOpen && visibleResults.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
          {visibleResults.map((item) => (
            <button
              key={item.itemId}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                onChange(item)
                setQuery(item.name)
                setIsOpen(false)
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
