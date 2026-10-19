import { prisma } from "@/lib/prisma"

/**
 * Check if a user can perform an action at a venue
 */
export async function checkPermission(
  userId: string,
  venueId: string,
  action: "view" | "log_service" | "log_transaction" | "log_patron" | "view_shifts" | "clock_shift" | "toggle_room"
): Promise<boolean> {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      venueId,
      status: "active",
    },
  })

  if (!membership) {
    return false
  }

  // OWNER and MANAGER can do everything
  if (membership.role === "OWNER" || membership.role === "MANAGER") {
    return true
  }

  // STAFF can log services, patron visits, and transactions (sales).
  // Aligned with the web transactions POST route, which only checks for
  // active membership - any active member can log a sale from either
  // surface.
  if (membership.role === "STAFF") {
    return (
      action === "log_service" ||
      action === "log_patron" ||
      action === "log_transaction" ||
      action === "view_shifts" ||
      action === "clock_shift" ||
      action === "toggle_room"
    )
  }

  return false
}
