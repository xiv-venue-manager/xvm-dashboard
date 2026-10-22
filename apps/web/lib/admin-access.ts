import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getValidXvmApiToken } from "@/lib/api/xvm-api-store"

/**
 * Two separate authorities are in play, and this only checks the first:
 * Prisma's `User.isAdmin` decides who sees the dashboard's admin pages, while
 * xvm-api's `platform_admin` scope decides who may actually write. A dashboard
 * admin whose xvm-api credential lacks the scope gets a 403 from xvm-api, which
 * the routes pass through. That could be pre-empted now: `/me` gained a `scopes`
 * list on 2026-10-03, a day after this was written, so the gate could check for
 * `platform_admin` itself and say so plainly rather than relaying xvm-api's 403.
 * Not done here because it costs a `/me` call on every admin request.
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
  return user?.isAdmin ?? false
}

type AdminGate = { error: NextResponse } | { error: null; userId: string; token: string }

/** Session, admin flag and a usable xvm-api token, or the response to return. */
export async function requirePlatformAdmin(): Promise<AdminGate> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  // A code, not prose: xvm-api also answers 403 when the credential lacks the platform_admin
  // scope, and the two want different advice. Without something to tell them apart a page can
  // only guess, and guessing the scope sends an admin to reconnect a link that was never the
  // problem.
  if (!(await isAdminUser(session.user.id))) {
    return {
      error: NextResponse.json(
        { error: "not_admin", message: "This page is for platform admins." },
        { status: 403 }
      ),
    }
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    return { error: NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }) }
  }

  return { error: null, userId: session.user.id, token }
}
