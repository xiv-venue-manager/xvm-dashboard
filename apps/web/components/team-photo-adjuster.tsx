"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  clampFrame,
  DEFAULT_PHOTO_FRAME,
  dragFrame,
  PHOTO_ZOOM_MAX,
  PHOTO_ZOOM_MIN,
  photoImageStyle,
  type PhotoFrame,
} from "@/lib/team-photo"

const NUDGE = 0.02
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-NUDGE, 0],
  ArrowRight: [NUDGE, 0],
  ArrowUp: [0, -NUDGE],
  ArrowDown: [0, NUDGE],
}

export function TeamPhotoAdjuster({
  src,
  frame,
  onChange,
  disabled,
  size = 240,
}: {
  src: string
  frame: PhotoFrame
  onChange: (frame: PhotoFrame) => void
  disabled?: boolean
  size?: number
}) {
  const [aspect, setAspect] = useState(1)
  const [dragging, setDragging] = useState(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label="Photo position"
        tabIndex={0}
        style={{ width: size, height: size }}
        className={`relative max-w-full touch-none overflow-hidden rounded-xl border border-[var(--blue-018)] ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={(e) => {
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          last.current = { x: e.clientX, y: e.clientY }
          setDragging(true)
        }}
        onPointerMove={(e) => {
          if (!last.current) return
          const dx = e.clientX - last.current.x
          const dy = e.clientY - last.current.y
          last.current = { x: e.clientX, y: e.clientY }
          onChange(dragFrame(frame, { dx, dy }, size, aspect))
        }}
        onPointerUp={() => {
          last.current = null
          setDragging(false)
        }}
        onPointerCancel={() => {
          last.current = null
          setDragging(false)
        }}
        onKeyDown={(e) => {
          const step = ARROWS[e.key]
          if (!step || disabled) return
          e.preventDefault()
          onChange(clampFrame({ ...frame, x: frame.x + step[0], y: frame.y + step[1] }))
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 1)}
          style={photoImageStyle(frame)}
        />
      </div>
      <div className="flex items-center gap-3" style={{ maxWidth: size }}>
        <Label htmlFor="photo-zoom">Zoom</Label>
        <input
          id="photo-zoom"
          type="range"
          min={PHOTO_ZOOM_MIN}
          max={PHOTO_ZOOM_MAX}
          step={0.01}
          value={frame.zoom}
          disabled={disabled}
          onChange={(e) => onChange(clampFrame({ ...frame, zoom: Number(e.target.value) }))}
          className="min-w-0 flex-1"
        />
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange(DEFAULT_PHOTO_FRAME)}>
          Reset
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Drag the photo to move it. Press Save to keep the position.</p>
    </div>
  )
}
