import { apiRoute, type ApiRequestInit } from "@/lib/api-fetch"

export type ContestKind = "giveaway" | "raffle"
export type ContestAction = "entries" | "roll" | "posts"

export function contestCall<T>(
  venueId: string,
  kind: ContestKind,
  id: number,
  action: ContestAction,
  init: ApiRequestInit = {}
): Promise<T> {
  if (kind === "giveaway") {
    const params = { venueId, giveawayId: id }
    if (action === "entries")
      return apiRoute<T>("/api/venues/[venueId]/contests/giveaways/[giveawayId]/entries", { ...init, params })
    if (action === "roll")
      return apiRoute<T>("/api/venues/[venueId]/contests/giveaways/[giveawayId]/roll", { ...init, params })
    return apiRoute<T>("/api/venues/[venueId]/contests/giveaways/[giveawayId]/posts", { ...init, params })
  }
  const params = { venueId, raffleId: id }
  if (action === "entries")
    return apiRoute<T>("/api/venues/[venueId]/contests/raffles/[raffleId]/entries", { ...init, params })
  if (action === "roll")
    return apiRoute<T>("/api/venues/[venueId]/contests/raffles/[raffleId]/roll", { ...init, params })
  return apiRoute<T>("/api/venues/[venueId]/contests/raffles/[raffleId]/posts", { ...init, params })
}
