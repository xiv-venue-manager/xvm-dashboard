import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockVenueFindUnique, mockMembershipFindFirst, mockGetValidXvmApiToken, mockCreateFinanceTransaction, mockGetService } =
  vi.hoisted(() => ({
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
  })

  const financeTransactionResponse = {
    id: 7,
    kind: "sale",
    entry_type: "credit",
    status: "posted",
    amount: 1000,
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
      amount: 10,
      customerName: "Bob",
    } satisfies CreateTransactionInput)

    expect(mockCreateFinanceTransaction).toHaveBeenCalledWith("token123", 42, {
      kind: "sale",
      amount: 1000,
      service_id: 3,
      customer_name: "Bob",
      notes: undefined,
    })
    expect(mockGetService).toHaveBeenCalledWith("token123", 42, 3)
    expect(result).toMatchObject({
      id: 7,
      amount: 10,
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
})
