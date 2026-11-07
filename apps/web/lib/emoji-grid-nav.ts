export interface SwatchRect {
  left: number
  right: number
  top: number
  bottom: number
}

export const GRID_NAV_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"] as const
export type GridNavKey = (typeof GRID_NAV_KEYS)[number]

const ROW_TOLERANCE = 1

function nearestInRow(rects: SwatchRect[], candidates: number[], rowTop: number, centerX: number): number {
  let best = candidates[0]
  let bestDistance = Infinity
  for (const i of candidates) {
    if (Math.abs(rects[i].top - rowTop) > ROW_TOLERANCE) continue
    const distance = Math.abs((rects[i].left + rects[i].right) / 2 - centerX)
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  }
  return best
}

// Returns the index to focus next, the same index when there is nowhere to go, or -1 for "above the
// first row". Rows come from the rendered rects rather than a column count, since the grid wraps
// to whatever width the popup has.
export function nextSwatchIndex(rects: SwatchRect[], current: number, key: GridNavKey): number {
  const last = rects.length - 1
  if (key === "Home") return 0
  if (key === "End") return last
  if (key === "ArrowLeft") return Math.max(current - 1, 0)
  if (key === "ArrowRight") return Math.min(current + 1, last)

  const here = rects[current]
  const centerX = (here.left + here.right) / 2
  const all = rects.map((_, i) => i)
  if (key === "ArrowDown") {
    const below = all.filter((i) => rects[i].top > here.top + ROW_TOLERANCE)
    if (below.length === 0) return current
    return nearestInRow(rects, below, Math.min(...below.map((i) => rects[i].top)), centerX)
  }
  const above = all.filter((i) => rects[i].top < here.top - ROW_TOLERANCE)
  if (above.length === 0) return -1
  return nearestInRow(rects, above, Math.max(...above.map((i) => rects[i].top)), centerX)
}
