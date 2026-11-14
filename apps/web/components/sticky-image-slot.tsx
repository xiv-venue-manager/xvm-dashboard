"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import type { StickyImageSlot as Slot, StickyRow } from "@/lib/api/xvm-api"

export interface StickyImageSlotProps {
  venueId: string
  stickyId: number
  slot: Slot
  label: string
  url: string | null
  canManage: boolean
  onChange: (patch: Partial<StickyRow>) => void
}

export function StickyImageSlot({ venueId, stickyId, slot, label, url, canManage, onChange }: StickyImageSlotProps) {
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const params = { venueId, stickyId, image: slot }

  async function upload() {
    if (!file) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const row = await apiRoute<StickyRow>("/api/venues/[venueId]/sticky-messages/[stickyId]/images/[image]", {
        params,
        method: "PUT",
        body: form,
      })
      onChange(row)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ""
      toast.success(`${label} saved.`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : `Failed to upload the ${label.toLowerCase()}.`)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await apiRoute("/api/venues/[venueId]/sticky-messages/[stickyId]/images/[image]", { params, method: "DELETE" })
      onChange({ [`${slot}_url`]: null })
      toast.success(`${label} removed.`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : `Failed to remove the ${label.toLowerCase()}.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        {url ? <img src={url} alt="" className="h-12 w-12 rounded object-cover" /> : <span className="text-xs text-muted-foreground">None</span>}
        {canManage && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="max-w-[14rem] text-xs"
              aria-label={`${label} file`}
            />
            <Button size="sm" variant="outline-blue" disabled={busy || !file} onClick={upload}>
              Upload
            </Button>
            {url && (
              <Button size="sm" variant="outline" disabled={busy} onClick={remove}>
                Remove
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
