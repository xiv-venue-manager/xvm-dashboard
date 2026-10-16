"use client"

import { useRef, useState } from "react"
import { ImageIcon, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { apiFetch, ApiError } from "@/lib/api-fetch"

interface BannerUploadProps {
  venueSlug: string
  initialUrl: string | null
  onUpdate: (url: string | null) => void
}

export function BannerUpload({ venueSlug, initialUrl, onUpdate }: BannerUploadProps) {
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const { uploadUrl, storedUrl } = await apiFetch<{ uploadUrl: string; storedUrl: string }>("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
      })

      await apiFetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })

      await apiFetch(`/api/venues/${venueSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerUrl: storedUrl }),
      })

      setUrl(storedUrl)
      onUpdate(storedUrl)
      toast.success("Banner updated")
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.message : "Failed to upload banner. Please try again.")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const remove = async () => {
    setUploading(true)
    try {
      await apiFetch(`/api/venues/${venueSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerUrl: null }),
      })
      setUrl(null)
      onUpdate(null)
      toast.success("Banner removed")
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove banner. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      {url ? (
        <div className="relative rounded-xl overflow-hidden border border-[var(--blue-015)] bg-[var(--blue-007)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Venue banner" className="w-full h-40 object-cover" />
          <div className="absolute top-2 right-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="h-7 text-xs bg-[rgba(7,11,20,0.8)] border-[var(--blue-020)] hover:border-[var(--xiv-blue)]"
            >
              <Upload className="w-3 h-3 mr-1" /> Change
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={remove}
              disabled={uploading}
              className="h-7 text-xs bg-[rgba(7,11,20,0.8)] border-[rgba(243,139,168,0.3)] text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
            >
              <Trash2 className="w-3 h-3 mr-1" /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full border border-dashed border-[var(--blue-015)] rounded-xl p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-[var(--blue-035)] hover:bg-[var(--blue-007)] hover:text-foreground transition-colors cursor-pointer"
        >
          <ImageIcon className="w-7 h-7 opacity-40" />
          <div className="text-sm">
            <span className="font-medium text-[var(--xiv-blue)]">Upload a banner image</span>
          </div>
          <p className="text-xs opacity-60">Recommended: 1200 × 630 px · JPEG, PNG or WebP · max 10 MB</p>
          <p className="text-xs opacity-50">
            Used as the preview image when sharing your venue link on Discord or social media.
          </p>
        </button>
      )}

      {uploading && <p className="text-xs text-[var(--xiv-blue)] text-center animate-pulse">Uploading…</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) upload(f)
        }}
      />
    </div>
  )
}
