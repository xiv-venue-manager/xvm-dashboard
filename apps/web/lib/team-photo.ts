import type { CSSProperties } from "react"

export const PHOTO_ZOOM_MIN = 1
export const PHOTO_ZOOM_MAX = 3

export type PhotoFrame = { x: number; y: number; zoom: number }

export const DEFAULT_PHOTO_FRAME: PhotoFrame = { x: 0.5, y: 0.5, zoom: 1 }

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export function clampFrame(frame: PhotoFrame): PhotoFrame {
  return {
    x: clamp(frame.x, 0, 1, DEFAULT_PHOTO_FRAME.x),
    y: clamp(frame.y, 0, 1, DEFAULT_PHOTO_FRAME.y),
    zoom: clamp(frame.zoom, PHOTO_ZOOM_MIN, PHOTO_ZOOM_MAX, DEFAULT_PHOTO_FRAME.zoom),
  }
}

const pct = (value: number) => `${Math.round(value * 1000) / 10}%`

export function photoImageStyle({ x, y, zoom }: PhotoFrame): CSSProperties {
  return {
    position: "absolute",
    left: pct(-(zoom - 1) * x),
    top: pct(-(zoom - 1) * y),
    width: pct(zoom),
    height: pct(zoom),
    objectFit: "cover",
    objectPosition: `${pct(x)} ${pct(y)}`,
    maxWidth: "none",
  }
}

export function dragFrame(
  frame: PhotoFrame,
  delta: { dx: number; dy: number },
  boxSize: number,
  aspect: number
): PhotoFrame {
  const overflowX = frame.zoom * Math.max(boxSize, boxSize * aspect) - boxSize
  const overflowY = frame.zoom * Math.max(boxSize, boxSize / aspect) - boxSize
  return clampFrame({
    x: overflowX > 0.5 ? frame.x - delta.dx / overflowX : frame.x,
    y: overflowY > 0.5 ? frame.y - delta.dy / overflowY : frame.y,
    zoom: frame.zoom,
  })
}
