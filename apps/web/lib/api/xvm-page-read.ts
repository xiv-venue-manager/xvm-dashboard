import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"

export type XvmPageRead = <T>(
  label: string,
  fallback: T,
  call: (token: string, xvmApiVenueId: string) => Promise<T>
) => Promise<T>

export type XvmPersonRead = <T>(label: string, fallback: T, call: (token: string) => Promise<T>) => Promise<T>

function readerFor(userId: string, token: string | null): XvmPersonRead {
  return async (label, fallback, call) => {
    if (!token) return fallback
    try {
      return await call(token)
    } catch (err) {
      console.error(`[${label}] xvm-api read error:`, err)
      if (isXvmAuthFailure(err)) await invalidateXvmApiCredential(userId)
      return fallback
    }
  }
}

export async function xvmPageReader(userId: string, xvmApiVenueId: string | null): Promise<XvmPageRead> {
  const read = readerFor(userId, xvmApiVenueId ? await getValidXvmApiToken(userId) : null)
  return (label, fallback, call) => read(label, fallback, (token) => call(token, xvmApiVenueId as string))
}

export async function xvmPersonReader(userId: string): Promise<XvmPersonRead> {
  return readerFor(userId, await getValidXvmApiToken(userId))
}
