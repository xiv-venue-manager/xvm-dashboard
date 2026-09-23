import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"

export type XvmPageRead = <T>(
  label: string,
  fallback: T,
  call: (token: string, xvmApiVenueId: string) => Promise<T>
) => Promise<T>

export async function xvmPageReader(userId: string, xvmApiVenueId: string | null): Promise<XvmPageRead> {
  const token = xvmApiVenueId ? await getValidXvmApiToken(userId) : null
  return async (label, fallback, call) => {
    if (!token || !xvmApiVenueId) return fallback
    try {
      return await call(token, xvmApiVenueId)
    } catch (err) {
      console.error(`[${label}] xvm-api read error:`, err)
      if (isXvmAuthFailure(err)) await invalidateXvmApiCredential(userId)
      return fallback
    }
  }
}
