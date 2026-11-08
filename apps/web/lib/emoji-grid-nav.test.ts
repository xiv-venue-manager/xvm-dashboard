import { describe, it, expect } from "vitest"
import { nextSwatchIndex, type SwatchRect } from "./emoji-grid-nav"

function cell(col: number, row: number, rowTop = row * 30): SwatchRect {
  return { left: col * 28, right: col * 28 + 24, top: rowTop, bottom: rowTop + 24 }
}

// Three columns in the first row, a heading gap, then a ragged second row of two:
//   0 1 2
//   3 4
const grid = [cell(0, 0), cell(1, 0), cell(2, 0), cell(0, 0, 70), cell(1, 0, 70)]

describe("nextSwatchIndex", () => {
  it("moves one swatch left and right, stopping at the ends", () => {
    expect(nextSwatchIndex(grid, 1, "ArrowRight")).toBe(2)
    expect(nextSwatchIndex(grid, 1, "ArrowLeft")).toBe(0)
    expect(nextSwatchIndex(grid, 0, "ArrowLeft")).toBe(0)
    expect(nextSwatchIndex(grid, 4, "ArrowRight")).toBe(4)
  })

  it("wraps from the end of one row to the start of the next", () => {
    expect(nextSwatchIndex(grid, 2, "ArrowRight")).toBe(3)
    expect(nextSwatchIndex(grid, 3, "ArrowLeft")).toBe(2)
  })

  it("jumps to the first and last swatch", () => {
    expect(nextSwatchIndex(grid, 2, "Home")).toBe(0)
    expect(nextSwatchIndex(grid, 0, "End")).toBe(4)
  })

  it("moves down to the nearest column, clamping into a shorter row", () => {
    expect(nextSwatchIndex(grid, 0, "ArrowDown")).toBe(3)
    expect(nextSwatchIndex(grid, 1, "ArrowDown")).toBe(4)
    expect(nextSwatchIndex(grid, 2, "ArrowDown")).toBe(4)
  })

  it("moves up to the nearest column", () => {
    expect(nextSwatchIndex(grid, 3, "ArrowUp")).toBe(0)
    expect(nextSwatchIndex(grid, 4, "ArrowUp")).toBe(1)
  })

  it("stays put on the last row going down, and reports the top edge going up", () => {
    expect(nextSwatchIndex(grid, 4, "ArrowDown")).toBe(4)
    expect(nextSwatchIndex(grid, 1, "ArrowUp")).toBe(-1)
  })

  it("treats rects within a pixel of each other as one row", () => {
    const jittered = [cell(0, 0, 0), cell(1, 0, 0.4), cell(0, 0, 60), cell(1, 0, 60.4)]
    expect(nextSwatchIndex(jittered, 0, "ArrowDown")).toBe(2)
    expect(nextSwatchIndex(jittered, 1, "ArrowDown")).toBe(3)
  })
})
