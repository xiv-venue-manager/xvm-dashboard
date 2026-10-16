"use client"

import { useState, useRef } from "react"
import { ImageIcon, Trash2, Upload, X } from "lucide-react"
import type { VenueImage } from "@/lib/api/xvm-api"

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

interface GalleryManagerProps {
  venueSlug: string
  initialImages: VenueImage[]
}

export function GalleryManager({ venueSlug, initialImages }: GalleryManagerProps) {
  const [images, setImages] = useState<VenueImage[]>(initialImages)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    setError("")
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Image is too large - max 8 MB.")
      if (inputRef.current) inputRef.current.value = ""
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`/api/venues/${venueSlug}/gallery`, { method: "POST", body: form })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || "Upload failed")
      }
      const image: VenueImage = await res.json()
      setImages((prev) => [...prev, image])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const remove = async (imageId: number) => {
    setError("")
    try {
      const res = await fetch(`/api/venues/${venueSlug}/gallery`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      })
      if (!res.ok) throw new Error("Failed to remove image")
      setImages((prev) => prev.filter((img) => img.id !== imageId))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove")
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--destructive-soft)] border border-[rgba(243,139,168,0.2)] text-sm text-[var(--destructive)]">
          <X className="w-4 h-4 flex-shrink-0" onClick={() => setError("")} style={{ cursor: "pointer" }} />
          {error}
        </div>
      )}

      {images.length > 0 && (
        <div className="gallery">
          {images.map((img) => (
            <div key={img.id} className="gtile group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.image_url} alt="Gallery image" className="absolute inset-0 w-full h-full object-cover" />
              <button
                onClick={() => remove(img.id)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-[rgba(0,0,0,0.7)] border border-[rgba(243,139,168,0.3)] text-[var(--destructive)] p-1.5 rounded-lg hover:bg-[var(--destructive-soft)]"
                title="Remove image"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {images.length < 9 && (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="gtile border-dashed hover:border-[var(--blue-035)] hover:bg-[var(--blue-007)] transition-colors cursor-pointer"
            >
              <Upload className="w-6 h-6 text-[var(--fg-faint)]" />
            </button>
          )}
        </div>
      )}

      {images.length === 0 && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full border border-dashed border-[var(--blue-015)] rounded-xl p-8 flex flex-col items-center gap-3 text-muted-foreground hover:border-[var(--blue-035)] hover:bg-[var(--blue-007)] hover:text-foreground transition-colors cursor-pointer"
        >
          <ImageIcon className="w-8 h-8 opacity-40" />
          <div className="text-sm">
            <span className="font-medium text-[var(--xiv-blue)]">Upload photos</span> of your venue
          </div>
          <p className="text-xs opacity-60">JPEG, PNG or WebP · max 8 MB · up to 9 images</p>
        </button>
      )}

      {uploading && <p className="text-xs text-[var(--xiv-blue)] text-center animate-pulse">Uploading…</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) upload(f)
        }}
      />
    </div>
  )
}
