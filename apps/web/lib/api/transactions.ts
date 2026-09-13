import { venueEventBus } from "@/lib/sse/venue-events"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { validators, sanitizeDiscordContent } from "@/lib/validation"
import {
  sendDiscordWebhook,
  formatSaleLoggedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"
import { resolveDisplayName } from "@/lib/display-name"
import { parseVenueSettings } from "@/lib/types/venue-settings"
import { getValidXvmApiToken } from "@/lib/api/xvm-api-store"
import { createFinanceTransaction, getService, XvmApiError, type FinanceTransactionKind } from "@/lib/api/xvm-api"
import { dollarsToMinorUnits, minorUnitsToDollars } from "@/lib/api/position-convert"

/**
 * Shared validation schema for transaction creation. Used by both the
 * session-authed web route (/api/venues/[venueId]/transactions) and the
 * api-key-authed plugin route (/api/plugin/transactions). Keeping the
 * schema here means the two callers can't drift - adding a field in one
 * place adds it in both.
 */
export const createTransactionSchema = z.object({
  serviceId: z.string().optional(),
  eventId: z.string().optional(),
  type: z.enum(["SALE", "TIP", "COVER_CHARGE", "OTHER"]).optional().default("SALE"),
  amount: validators.amount,
  customerName: validators.customerName,
  notes: validators.transactionNotes,
})

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>

/**
 * Thrown by createTransaction when the target service has stockCount <= 0.
 * Callers translate this into a 409 response - it is a hard block, not a
 * warning, matching the approved bar-inventory-mapping design.
 */
export class InsufficientStockError extends Error {
  constructor(serviceName: string) {
    super(`${serviceName} is out of stock`)
    this.name = "InsufficientStockError"
  }
}

// Prisma's TransactionType -> xvm-api's FinanceTransactionKind. Not a perfect
// semantic match: xvm-api also has "expense" and "payout" kinds that the
// dashboard's OTHER type never meant to cover. Flagged for review - closest
// fit chosen so OTHER doesn't crash, not a validated mapping.
const TRANSACTION_KIND_MAP: Record<CreateTransactionInput["type"], FinanceTransactionKind> = {
  SALE: "sale",
  TIP: "tip",
  COVER_CHARGE: "cover_charge",
  OTHER: "other_income",
}

/**
 * Create a transaction row in xvm-api, fire the sale-logged Discord webhook,
 * and emit the SSE event for the live dashboard. Callers are responsible for
 * auth, venue access verification, and permission checks - this helper only
 * owns the domain write + side effects.
 */
export async function createTransaction(venueId: string, staffUserId: string, input: CreateTransactionInput) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { xvmApiVenueId: true, discordWebhookUrl: true, settings: true },
  })
  if (!venue?.xvmApiVenueId) {
    throw new Error(`Venue ${venueId} is not connected to xvm-api`)
  }
  const xvmApiVenueId = venue.xvmApiVenueId

  const token = await getValidXvmApiToken(staffUserId)
  if (!token) {
    throw new Error(`No valid xvm-api token for user ${staffUserId}`)
  }

  // input.eventId is intentionally dropped here. xvm-api's finance
  // transactions take an int event_id, but Prisma's Event ids are cuids -
  // there is no bridge between the two yet (a separate, not-yet-started
  // cutover). The transaction is created venue-scoped but not event-scoped
  // for now; this is a known, accepted gap, not something to work around.
  const resolvedType = input.type ?? "SALE"
  const serviceId = input.serviceId ? Number(input.serviceId) : undefined

  let newTransaction
  try {
    newTransaction = await createFinanceTransaction(token, xvmApiVenueId, {
      kind: TRANSACTION_KIND_MAP[resolvedType],
      amount: dollarsToMinorUnits(input.amount)!,
      service_id: serviceId,
      customer_name: input.customerName,
      notes: input.notes,
    })
  } catch (error) {
    // xvm-api's sale hook refuses an out-of-stock sale with 409 at insert
    // time, replacing the old Prisma pre-check + atomic decrement.
    if (error instanceof XvmApiError && error.status === 409) {
      const serviceName = serviceId
        ? (await getService(token, xvmApiVenueId, serviceId)).name
        : "This service"
      throw new InsufficientStockError(serviceName)
    }
    throw error
  }

  // Minor display regression flagged for review: the old code joined
  // Transaction.staff.characters for a richer name including FFXIV
  // character name. Transaction creation no longer goes through Prisma, so
  // that relation isn't available here - fall back to nickname only.
  const staffMembership = await prisma.membership.findFirst({
    where: { userId: staffUserId, venueId },
    select: { nickname: true },
  })
  const resolvedStaffName = resolveDisplayName({
    characterName: undefined,
    nickname: staffMembership?.nickname,
    displayName: undefined,
    discordName: undefined,
  })

  const amountDollars = minorUnitsToDollars(newTransaction.amount)!
  const serviceForEmbed = newTransaction.service_id
    ? { id: newTransaction.service_id, name: newTransaction.service_name ?? "" }
    : null

  // Discord webhook (fire-and-forget - never block the response)
  if (venue) {
    const venueSettings = parseVenueSettings(venue.settings)
    const webhookConfig: VenueWebhookConfig = {
      discordWebhooks: venueSettings.discordWebhooks,
      webhooks: venueSettings.webhooks,
      discordWebhookUrl: venue.discordWebhookUrl,
    }

    const webhookUrl = getWebhookUrlForType(webhookConfig, "saleLogged")
    if (webhookUrl) {
      const embed = formatSaleLoggedEmbed({
        amount: amountDollars,
        service: serviceForEmbed,
        customerName: sanitizeDiscordContent(newTransaction.customer_name),
        staff: { name: resolvedStaffName },
      })

      sendDiscordWebhook(webhookUrl, { embeds: [embed] }).catch((error) =>
        console.error("Failed to send Discord webhook:", error)
      )
    }
  }

  venueEventBus.emit(venueId, {
    id: String(newTransaction.id),
    type: "sale",
    venueId,
    timestamp: newTransaction.created_at,
    data: {
      amount: amountDollars,
      customerName: newTransaction.customer_name,
      service: serviceForEmbed,
      staff: { id: staffUserId, name: resolvedStaffName },
      notes: newTransaction.notes,
    },
  })

  return {
    id: newTransaction.id,
    amount: amountDollars,
    customerName: newTransaction.customer_name,
    serviceId: newTransaction.service_id,
    // stockCount is always null here - the finance-transaction create
    // response doesn't include the post-decrement stock level, and fetching
    // it would mean an extra xvm-api round trip on every sale. The plugin
    // route only surfaces this for display; not fetching it is an accepted
    // simplification, not a silently dropped requirement.
    service: newTransaction.service_id
      ? { id: newTransaction.service_id, name: newTransaction.service_name, stockCount: null as number | null }
      : null,
    notes: newTransaction.notes,
    createdAt: newTransaction.created_at,
  }
}
