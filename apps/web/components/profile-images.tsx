"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { PROFILE_LIMITS } from "@/lib/profiles"
import type { ProfileImageRow, ProfileRow } from "@/lib/api/xvm-api"

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif"

export interface ProfileImageSlotProps {
  venueId: string
  profileId: number
  label: string
  slot: "thumbnail" | "main-image"
  url: string | null
  onChange: (patch: Partial<ProfileRow>) => void
}

export function ProfileImageSlot({ venueId, profileId, label, slot, url, onChange }: ProfileImageSlotProps) {
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const params = { venueId, profileId }
  const field = slot === "thumbnail" ? "thumbnail_url" : "main_image_url"
  const send = (init: { method: "PUT" | "DELETE"; body?: FormData }) =>
    slot === "thumbnail"
      ? apiRoute<ProfileRow>("/api/venues/[venueId]/profiles/[profileId]/thumbnail", { params, ...init })
      : apiRoute<ProfileRow>("/api/venues/[venueId]/profiles/[profileId]/main-image", { params, ...init })

  async function upload() {
    if (!file) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const saved = await send({ method: "PUT", body })
      onChange({ [field]: saved[field] })
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
      await send({ method: "DELETE" })
      onChange({ [field]: null })
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
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-12 w-12 rounded object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
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
      </div>
    </div>
  )
}

const GALLERY_ITEM = "/api/venues/[venueId]/profiles/[profileId]/images/[imageId]"

function GalleryItem({
  venueId,
  profileId,
  image,
  first,
  last,
  busy,
  onSaved,
  onRemove,
  onMove,
}: {
  venueId: string
  profileId: number
  image: ProfileImageRow
  first: boolean
  last: boolean
  busy: boolean
  onSaved: (image: ProfileImageRow) => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const [caption, setCaption] = useState(image.caption ?? "")
  const [saving, setSaving] = useState(false)
  const dirty = caption.trim() !== (image.caption ?? "")

  async function saveCaption() {
    setSaving(true)
    try {
      const saved = await apiRoute<ProfileImageRow>(GALLERY_ITEM, {
        params: { venueId, profileId, imageId: image.id },
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption }),
      })
      onSaved(saved)
      toast.success("Caption saved.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save the caption.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.image_url} alt={image.caption ?? ""} className="h-16 w-16 rounded object-cover" />
      <Input
        aria-label="Caption"
        placeholder="Caption"
        value={caption}
        maxLength={PROFILE_LIMITS.caption}
        onChange={(e) => setCaption(e.target.value)}
        disabled={saving}
        className="max-w-xs flex-1"
      />
      <Button size="sm" disabled={!dirty || saving} onClick={saveCaption}>
        Save caption
      </Button>
      <Button size="sm" variant="outline" aria-label="Move up" disabled={busy || first} onClick={() => onMove(-1)}>
        &uarr;
      </Button>
      <Button size="sm" variant="outline" aria-label="Move down" disabled={busy || last} onClick={() => onMove(1)}>
        &darr;
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={onRemove}>
        Remove
      </Button>
    </div>
  )
}

export interface ProfileGalleryProps {
  venueId: string
  profileId: number
  images: ProfileImageRow[]
  onChange: (images: ProfileImageRow[]) => void
}

export function ProfileGallery({ venueId, profileId, images, onChange }: ProfileGalleryProps) {
  const ordered = [...images].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function add() {
    if (!file) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const added = await apiRoute<ProfileImageRow>("/api/venues/[venueId]/profiles/[profileId]/images", {
        params: { venueId, profileId },
        method: "POST",
        body,
      })
      onChange([...images, added])
      setFile(null)
      if (inputRef.current) inputRef.current.value = ""
      toast.success("Image added.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to add the image.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(image: ProfileImageRow) {
    setBusy(true)
    try {
      await apiRoute(GALLERY_ITEM, { params: { venueId, profileId, imageId: image.id }, method: "DELETE" })
      onChange(images.filter((i) => i.id !== image.id))
      toast.success("Image removed.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove the image.")
    } finally {
      setBusy(false)
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const a = ordered[index]
    const b = ordered[index + direction]
    if (!a || !b) return
    const orderOf = (row: ProfileImageRow, to: number) =>
      apiRoute<ProfileImageRow>(GALLERY_ITEM, {
        params: { venueId, profileId, imageId: row.id },
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: to }),
      })
    setBusy(true)
    try {
      const savedA = await orderOf(a, b.sort_order)
      const savedB = await orderOf(b, a.sort_order)
      onChange(images.map((i) => (i.id === savedA.id ? savedA : i.id === savedB.id ? savedB : i)))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to reorder the gallery.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <Label>Gallery</Label>
      {ordered.length === 0 && <p className="text-sm text-muted-foreground">No gallery images yet.</p>}
      {ordered.map((image, index) => (
        <GalleryItem
          key={image.id}
          venueId={venueId}
          profileId={profileId}
          image={image}
          first={index === 0}
          last={index === ordered.length - 1}
          busy={busy}
          onSaved={(saved) => onChange(images.map((i) => (i.id === saved.id ? saved : i)))}
          onRemove={() => remove(image)}
          onMove={(direction) => move(index, direction)}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="max-w-[14rem] text-xs"
          aria-label="Gallery image file"
        />
        <Button size="sm" variant="outline-blue" disabled={busy || !file} onClick={add}>
          Add image
        </Button>
      </div>
    </div>
  )
}
