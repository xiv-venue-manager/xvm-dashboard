import { describe, it, expect, vi } from "vitest"

const m = vi.hoisted(() => ({
  redirect: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    m.redirect(url)
    throw new Error("NEXT_REDIRECT")
  },
}))

import NewVenuePage from "./page"

describe("/venues/new", () => {
  it("sends a person to the get-started wizard, so one flow creates every venue", () => {
    expect(() => NewVenuePage()).toThrow("NEXT_REDIRECT")
    expect(m.redirect).toHaveBeenCalledWith("/get-started")
  })
})
