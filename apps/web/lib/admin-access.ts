import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getMe } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

const PLATFORM_ADMIN_SCOPE = "platform_admin"

type AdminGate = { error: NextResponse } | { error: null; userId: string; token: string }

/**
 * Session, platform_admin scope and a usable xvm-api token, or the response to return. xvm-api fixes the
 * scope when it mints the credential, so a change to a person's admin flag applies from their next sign-in.
 */
export async function requirePlatformAdmin(): Promise<AdminGate> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    return { error: NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }) }
  }

  let scopes: string[]
  try {
    scopes = (await getMe(token)).scopes
  } catch (err) {
    return { error: await xvmApiErrorResponse(err, session.user.id, "[admin access] /me read error") }
  }

  // A code, not prose: routes also pass xvm-api's own 403s through, and the page has to tell this
  // refusal from those.
  if (!scopes.includes(PLATFORM_ADMIN_SCOPE)) {
    return {
      error: NextResponse.json(
        { error: "not_admin", message: "This page is for platform admins." },
        { status: 403 }
      ),
    }
  }

  return { error: null, userId: session.user.id, token }
}
