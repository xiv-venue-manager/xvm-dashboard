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
import { gilToMinorUnits, minorUnitsToGil } from "@/lib/api/position-convert"
import { findLiveEventId } from "@/lib/api/event-window"

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

async function resolveEventId(token: string, xvmApiVenueId: string, requested: string | undefined) {
  if (requested !== undefined && /^\d+$/.test(requested)) return Number(requested)
  try {
    return (await findLiveEventId(token, xvmApiVenueId)) ?? undefined
  } catch (error) {
    console.error("Failed to resolve the live event for a sale:", error)
    return undefined
  }
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

  const resolvedType = input.type ?? "SALE"
  const serviceId = input.serviceId ? Number(input.serviceId) : undefined

  const eventId = await resolveEventId(token, xvmApiVenueId, input.eventId)

  let newTransaction
  try {
    newTransaction = await createFinanceTransaction(token, xvmApiVenueId, {
      kind: TRANSACTION_KIND_MAP[resolvedType],
      amount: gilToMinorUnits(input.amount)!,
      service_id: serviceId,
      customer_name: input.customerName,
      notes: input.notes,
      event_id: eventId,
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

  const amountDollars = minorUnitsToGil(newTransaction.amount)!
  const serviceForEmbed = newTransaction.service_id
    ? { id: newTransaction.service_id, name: newTransaction.service_name ?? "" }
    : null

  // Fetch live stock count for the plugin's post-sale confirmation (bartenders
  // see "3 left" immediately after logging a sale). Only when a service was
  // actually involved - tips/cover-charges never had a stock count. This is
  // an accepted extra round-trip; failure here must not fail an
  // already-successful sale, so fall back to null and log.
  let stockCount: number | null = null
  if (serviceId !== undefined) {
    try {
      const service = await getService(token, xvmApiVenueId, serviceId)
      stockCount = service.inventory?.stock_count ?? null
    } catch (error) {
      // Swallows ALL errors here, including a 401 from an expired/invalid
      // token. That's not a permanent mask: this sale's primary
      // createFinanceTransaction call already succeeded with this token, so
      // a 401 here would only blind this one sale's stock count - the next
      // sale hits the same bad token on its primary call and surfaces the
      // failure normally through xvmApiErrorResponse.
      console.error("Failed to fetch post-sale stock count:", error)
    }
  }

  // Discord webhook (fire-and-forget - never block the response)
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

  venueEventBus.emit(venueId, {
    id: `sale_${newTransaction.id}`,
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
    service: newTransaction.service_id
      ? { id: newTransaction.service_id, name: newTransaction.service_name, stockCount }
      : null,
    notes: newTransaction.notes,
    createdAt: newTransaction.created_at,
  }
}
