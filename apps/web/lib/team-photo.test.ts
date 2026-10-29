import { describe, it, expect } from "vitest"
import { clampFrame, DEFAULT_PHOTO_FRAME, dragFrame, photoImageStyle } from "./team-photo"

describe("clampFrame", () => {
  it("keeps values in range and falls back on NaN", () => {
    expect(clampFrame({ x: -1, y: 2, zoom: 9 })).toEqual({ x: 0, y: 1, zoom: 3 })
    expect(clampFrame({ x: 0.3, y: 0.7, zoom: 0.2 })).toEqual({ x: 0.3, y: 0.7, zoom: 1 })
    expect(clampFrame({ x: NaN, y: NaN, zoom: NaN })).toEqual(DEFAULT_PHOTO_FRAME)
  })
})

describe("photoImageStyle", () => {
  it("fills the frame at the default", () => {
    expect(photoImageStyle(DEFAULT_PHOTO_FRAME)).toEqual({
      position: "absolute",
      left: "0%",
      top: "0%",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: "50% 50%",
      maxWidth: "none",
    })
  })

  it("offsets a zoomed photo toward its corner", () => {
    const style = photoImageStyle({ x: 1, y: 0, zoom: 2 })
    expect(style).toMatchObject({ left: "-100%", top: "0%", width: "200%", height: "200%", objectPosition: "100% 0%" })
  })

  it("rounds odd fractions", () => {
    const style = photoImageStyle({ x: 0.1234, y: 0.5, zoom: 1.5 })
    expect(style).toMatchObject({ left: "-6.2%", top: "-25%", width: "150%", objectPosition: "12.3% 50%" })
  })
})

describe("dragFrame", () => {
  const frame = { x: 0.5, y: 0.5, zoom: 1 }

  it("does not move a square photo at zoom 1", () => {
    expect(dragFrame(frame, { dx: 40, dy: -40 }, 200, 1)).toEqual(frame)
  })

  it("moves a portrait only vertically at zoom 1", () => {
    const next = dragFrame(frame, { dx: 30, dy: 20 }, 200, 0.5)
    expect(next.x).toBe(0.5)
    expect(next.y).toBeCloseTo(0.5 - 20 / 200)
  })

  it("reaches y=0 dragging down by the full overflow from y=1", () => {
    expect(dragFrame({ ...frame, y: 1 }, { dx: 0, dy: 200 }, 200, 0.5).y).toBe(0)
  })

  it("clamps at both ends", () => {
    expect(dragFrame(frame, { dx: 0, dy: 5000 }, 200, 0.5).y).toBe(0)
    expect(dragFrame(frame, { dx: 0, dy: -5000 }, 200, 0.5).y).toBe(1)
  })

  it("lets zoom add horizontal overflow", () => {
    const next = dragFrame({ ...frame, zoom: 2 }, { dx: -100, dy: 0 }, 200, 1)
    expect(next.x).toBeCloseTo(0.5 + 100 / 200)
  })
})
