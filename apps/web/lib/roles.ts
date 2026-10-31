export type MembershipRole = "OWNER" | "MANAGER" | "STAFF"

const MANAGER_TIER: MembershipRole[] = ["OWNER", "MANAGER"]

/** True for OWNER/MANAGER — the "sees and manages everything" tier used across the dashboard. */
export function canManageVenue(role: MembershipRole | string | null | undefined): boolean {
  return !!role && MANAGER_TIER.includes(role as MembershipRole)
}

/** True for OWNER only — the small set of actions (e.g. deleting a service) reserved above manager. */
export function isVenueOwner(role: MembershipRole | string | null | undefined): boolean {
  return role === "OWNER"
}
