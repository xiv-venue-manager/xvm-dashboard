import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ directory: vi.fn() }))

vi.mock("@/lib/api/xvm-api", () => ({ listPublicDirectory: m.directory }))
vi.mock("@/lib/prisma", () => {
  throw new Error("the sitemap must not read Prisma")
})
vi.mock("./discover/[dc]/page", () => ({ DATA_CENTRES: [{ slug: "aether", name: "Aether" }] }))

import sitemap from "./sitemap"

beforeEach(() => {
  vi.clearAllMocks()
  m.directory.mockResolvedValue([{ slug: "the-gilded-rose" }, { slug: "moonlit-cafe" }])
})

describe("sitemap", () => {
  it("lists each directory venue under /venues without a modified date", async () => {
    const venues = (await sitemap()).filter((entry) => entry.url.includes("/venues/"))
    expect(venues.map((entry) => entry.url)).toEqual([
      "https://xivvenuemanager.com/venues/the-gilded-rose",
      "https://xivvenuemanager.com/venues/moonlit-cafe",
    ])
    expect(venues.every((entry) => entry.lastModified === undefined)).toBe(true)
  })

  it("keeps the static and data centre entries", async () => {
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls).toContain("https://xivvenuemanager.com")
    expect(urls).toContain("https://xivvenuemanager.com/discover")
    expect(urls).toContain("https://xivvenuemanager.com/discover/aether")
    expect(urls).toContain("https://xivvenuemanager.com/terms")
  })

  it("fails when xvm-api does, rather than serving a sitemap without venues", async () => {
    m.directory.mockRejectedValue(new Error("down"))
    await expect(sitemap()).rejects.toThrow("down")
  })
})
