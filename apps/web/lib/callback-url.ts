// A second "/" or "\" would make the rest a host, and browsers strip tabs and newlines before looking.
const SAME_ORIGIN_PATH = /^\/(?![/\\])[^\t\n\r]*$/

export function signInCallbackUrl(search: string, origin: string): string {
  const requested = new URLSearchParams(search).get("callbackUrl")
  // next-auth sends an absolute URL on our origin when it returns a failed sign-in here.
  const path = requested?.startsWith(`${origin}/`) ? requested.slice(origin.length) : requested
  return path && SAME_ORIGIN_PATH.test(path) ? path : "/dashboard"
}
