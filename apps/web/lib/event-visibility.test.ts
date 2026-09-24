import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockGetToken, mockInvalidate, mockGetVenue } = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
  mockInvalidate: vi.fn(),
  mockGetVenue: vi.fn(),
}))

vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: mockGetToken,
  invalidateXvmApiCredential: mockInvalidate,
  isXvmAuthFailure: (err: unknown) => (err as { status?: number }).status === 401,
}))
vi.mock("@/lib/api/xvm-api", () => ({ getVenue: mockGetVenue }))

import { eventHiddenFromStaff } from "./event-visibility"

const connected = { settings: null, xvmApiVenueId: "venue-1" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mockGetToken.mockResolvedValue("tok")
})

describe("eventHiddenFromStaff", () => {
  it("hides a draft from staff at a published-only venue", async () => {
    mockGetVenue.mockResolvedValue({ event_visibility: "published" })
    expect(await eventHiddenFromStaff("u", "STAFF", connected, "DRAFT")).toBe(true)
  })

  it("shows staff a published event without asking xvm-api", async () => {
    expect(await eventHiddenFromStaff("u", "STAFF", connected, "PUBLISHED")).toBe(false)
    expect(mockGetVenue).not.toHaveBeenCalled()
  })

  it("never hides events from managers or owners, and does not ask xvm-api", async () => {
    expect(await eventHiddenFromStaff("u", "MANAGER", connected, "DRAFT")).toBe(false)
    expect(await eventHiddenFromStaff("u", "OWNER", connected, "DRAFT")).toBe(false)
    expect(mockGetVenue).not.toHaveBeenCalled()
  })

  it("shows staff a draft when the venue shows everything", async () => {
    mockGetVenue.mockResolvedValue({ event_visibility: "all" })
    expect(await eventHiddenFromStaff("u", "STAFF", connected, "DRAFT")).toBe(false)
  })

  it("fails closed when xvm-api cannot be read", async () => {
    mockGetVenue.mockRejectedValue(new Error("down"))
    expect(await eventHiddenFromStaff("u", "STAFF", connected, "DRAFT")).toBe(true)
  })

  it("fails closed when the user has no xvm-api token", async () => {
    mockGetToken.mockResolvedValue(null)
    expect(await eventHiddenFromStaff("u", "STAFF", connected, "DRAFT")).toBe(true)
  })

  it("reads the setting from venue settings when the venue is not connected", async () => {
    const hidden = { settings: { eventVisibility: "published" }, xvmApiVenueId: null }
    const open = { settings: {}, xvmApiVenueId: null }
    expect(await eventHiddenFromStaff("u", "STAFF", hidden, "DRAFT")).toBe(true)
    expect(await eventHiddenFromStaff("u", "STAFF", open, "DRAFT")).toBe(false)
  })
})
