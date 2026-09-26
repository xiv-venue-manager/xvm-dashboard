import { describe, it, expect, vi, beforeEach } from "vitest"

const {
  mockVenueFindUnique,
  mockMembershipFindFirst,
  mockGetValidXvmApiToken,
  mockCreateFinanceTransaction,
  mockGetService,
  mockListEvents,
} = vi.hoisted(() => ({
    mockListEvents: vi.fn(),
    mockVenueFindUnique: vi.fn(),
    mockMembershipFindFirst: vi.fn(),
    mockGetValidXvmApiToken: vi.fn(),
    mockCreateFinanceTransaction: vi.fn(),
    mockGetService: vi.fn(),
  }))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    venue: { findUnique: mockVenueFindUnique },
    membership: { findFirst: mockMembershipFindFirst },
  },
}))
vi.mock("@/lib/api/xvm-api-store", () => ({ getValidXvmApiToken: mockGetValidXvmApiToken }))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/xvm-api")>()
  return {
    ...actual,
    createFinanceTransaction: mockCreateFinanceTransaction,
    getService: mockGetService,
    listEvents: mockListEvents,
  }
})
vi.mock("@/lib/sse/venue-events", () => ({ venueEventBus: { emit: vi.fn() } }))
vi.mock("@/lib/discord-webhook", () => ({
  sendDiscordWebhook: vi.fn(),
  formatSaleLoggedEmbed: vi.fn(() => ({})),
  getWebhookUrlForType: vi.fn(() => null),
}))

import { createTransaction, InsufficientStockError, type CreateTransactionInput } from "./transactions"
import { XvmApiError } from "@/lib/api/xvm-api"

describe("createTransaction (xvm-api)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVenueFindUnique.mockResolvedValue({ xvmApiVenueId: 42, discordWebhookUrl: null, settings: null })
    mockMembershipFindFirst.mockResolvedValue({ nickname: "Bobby" })
    mockGetValidXvmApiToken.mockResolvedValue("token123")
    mockListEvents.mockResolvedValue([])
  })

  const financeTransactionResponse = {
    id: 7,
    kind: "sale",
    entry_type: "credit",
    status: "posted",
    amount: 4500,
    category_id: null,
    event_id: null,
    service_id: 3,
    service_name: "Drink",
    membership_id: null,
    recorded_by_person_id: null,
    customer_name: "Bob",
    notes: null,
    idempotency_key: null,
    created_at: "2026-09-13T00:00:00.000Z",
    posted_at: null,
    posted_by_person_id: null,
    voided_at: null,
    voided_by_person_id: null,
    void_reason: null,
  }

  it("creates a sale transaction and returns the real post-sale stock count", async () => {
    mockCreateFinanceTransaction.mockResolvedValue(financeTransactionResponse)
    mockGetService.mockResolvedValue({ id: 3, name: "Drink", inventory: { stock_count: 5 } })

    const result = await createTransaction("venue1", "user1", {
      serviceId: "3",
      type: "SALE",
      amount: 4500,
      customerName: "Bob",
    } satisfies CreateTransactionInput)

    expect(mockCreateFinanceTransaction).toHaveBeenCalledWith("token123", 42, {
      kind: "sale",
      amount: 4500,
      service_id: 3,
      customer_name: "Bob",
      notes: undefined,
    })
    expect(mockGetService).toHaveBeenCalledWith("token123", 42, 3)
    expect(result).toMatchObject({
      id: 7,
      amount: 4500,
      customerName: "Bob",
      serviceId: 3,
      service: { id: 3, name: "Drink", stockCount: 5 },
    })
  })

  it("does not fetch stock count for a transaction with no serviceId", async () => {
    mockCreateFinanceTransaction.mockResolvedValue({
      ...financeTransactionResponse,
      service_id: null,
      service_name: null,
    })

    const result = await createTransaction("venue1", "user1", {
      type: "TIP",
      amount: 5,
      customerName: "Bob",
    } satisfies CreateTransactionInput)

    expect(mockGetService).not.toHaveBeenCalled()
    expect(result.service).toBeNull()
  })

  it("falls back to null stock count when the post-sale getService call throws", async () => {
    mockCreateFinanceTransaction.mockResolvedValue(financeTransactionResponse)
    mockGetService.mockRejectedValue(new Error("xvm-api unavailable"))
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await createTransaction("venue1", "user1", {
      serviceId: "3",
      type: "SALE",
      amount: 10,
      customerName: "Bob",
    } satisfies CreateTransactionInput)

    expect(result).toMatchObject({
      id: 7,
      service: { id: 3, name: "Drink", stockCount: null },
    })
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it("translates a 409 from xvm-api into InsufficientStockError with the service name", async () => {
    mockCreateFinanceTransaction.mockRejectedValue(new XvmApiError(409, "out of stock"))
    mockGetService.mockResolvedValue({ id: 3, name: "Potion" })

    const call = createTransaction("venue1", "user1", {
      serviceId: "3",
      type: "SALE",
      amount: 10,
      customerName: "Bob",
    } satisfies CreateTransactionInput)

    await expect(call).rejects.toThrow(InsufficientStockError)
    await expect(call).rejects.toThrow("Potion is out of stock")
  })

  describe("event attribution", () => {
    const hours = (h: number) => new Date(Date.now() + h * 3600000).toISOString()
    const liveItem = (id: number) => ({
      materialized: true,
      id,
      recurrence_rule_id: null,
      scheduled_at: null,
      title: "Live",
      description: null,
      event_type: "SOCIAL",
      location: null,
      image_url: null,
      starts_at: hours(-1),
      ends_at: hours(2),
      published_at: hours(-24),
      cancelled_at: null,
      cancel_reason: null,
    })
    const sale = { type: "SALE", amount: 100, customerName: "Bob" } satisfies CreateTransactionInput

    beforeEach(() => {
      mockCreateFinanceTransaction.mockResolvedValue(financeTransactionResponse)
    })

    it("uses a numeric event id from the caller without looking anything up", async () => {
      await createTransaction("venue1", "user1", { ...sale, eventId: "12" })
      expect(mockCreateFinanceTransaction.mock.calls[0][2].event_id).toBe(12)
      expect(mockListEvents).not.toHaveBeenCalled()
    })

    it("attributes the sale to the running event when the caller sends none", async () => {
      mockListEvents.mockResolvedValue([liveItem(31)])
      await createTransaction("venue1", "user1", sale)
      expect(mockCreateFinanceTransaction.mock.calls[0][2].event_id).toBe(31)
    })

    it("ignores an old cuid event id and falls back to the running event", async () => {
      mockListEvents.mockResolvedValue([liveItem(31)])
      await createTransaction("venue1", "user1", { ...sale, eventId: "cmabc123xyz" })
      expect(mockCreateFinanceTransaction.mock.calls[0][2].event_id).toBe(31)
    })

    it("leaves the sale unattributed when nothing is running", async () => {
      await createTransaction("venue1", "user1", sale)
      expect(mockCreateFinanceTransaction.mock.calls[0][2].event_id).toBeUndefined()
    })

    it("still records the sale when the live event lookup fails", async () => {
      mockListEvents.mockRejectedValue(new Error("xvm-api unavailable"))
      const spy = vi.spyOn(console, "error").mockImplementation(() => {})
      const result = await createTransaction("venue1", "user1", sale)
      expect(result.id).toBe(7)
      expect(mockCreateFinanceTransaction.mock.calls[0][2].event_id).toBeUndefined()
      spy.mockRestore()
    })

    it("skips a running occurrence that has no row yet", async () => {
      mockListEvents.mockResolvedValue([{ ...liveItem(0), id: null, materialized: false, recurrence_rule_id: 3 }])
      await createTransaction("venue1", "user1", sale)
      expect(mockCreateFinanceTransaction.mock.calls[0][2].event_id).toBeUndefined()
    })
  })
})
