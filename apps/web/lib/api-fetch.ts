import type { AppRouteHandlerRoutes, ParamsOf } from "../.next/types/routes"

/**
 * Thrown by apiFetch for both non-2xx HTTP responses and network failures.
 * `status` is 0 for network failures (fetch itself rejected, no response was received).
 */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options)
    this.name = "ApiError"
    this.status = status
  }
}

class UnparseableBody {
  constructor(public text: string) {}
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return new UnparseableBody(text)
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as { error?: unknown; message?: unknown }
    if (typeof b.message === "string" && b.message) return b.message
    if (typeof b.error === "string" && b.error) return b.error
  }
  return `Request failed (${status})`
}

/**
 * Fetch wrapper for JSON APIs. Parses the response body once, throws ApiError
 * on non-2xx responses (using the server's { error } message when present)
 * or on network failure. Returns undefined for empty 2xx bodies (e.g. a
 * presigned-URL PUT with no JSON response).
 */
export async function apiFetch<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch (cause) {
    throw new ApiError("Network error, check your connection and try again.", 0, { cause })
  }

  const body = await parseBody(res)

  if (res.ok && body instanceof UnparseableBody) {
    throw new ApiError("Unexpected response from the server.", res.status)
  }

  if (!res.ok) {
    throw new ApiError(extractErrorMessage(body, res.status), res.status)
  }

  return body as T
}

type RouteParams<R extends AppRouteHandlerRoutes> = keyof ParamsOf<R> extends never
  ? { params?: undefined }
  : { params: { [K in keyof ParamsOf<R>]: ParamsOf<R>[K] extends string[] ? string[] : string | number } }

export type ApiRequestInit = RequestInit & { query?: Record<string, string | number | boolean | undefined> }

export type ApiRouteInit<R extends AppRouteHandlerRoutes> = ApiRequestInit & RouteParams<R>

export function routePath(
  route: string,
  params: Record<string, string | number | string[]> = {},
  query: Record<string, string | number | boolean | undefined> = {}
): string {
  const path = route.replace(/\[(?:\.\.\.)?(\w+)\]/g, (_, name: string) =>
    [params[name]]
      .flat()
      .map((v) => encodeURIComponent(String(v)))
      .join("/")
  )
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value !== undefined) search.set(key, String(value))
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

type ApiRouteArgs = {
  [R in AppRouteHandlerRoutes]: keyof ParamsOf<R> extends never
    ? [route: R, init?: ApiRouteInit<R>]
    : [route: R, init: ApiRouteInit<R>]
}[AppRouteHandlerRoutes]

/**
 * apiFetch for this app's own route handlers. The route is checked against the routes Next
 * generates, so deleting or renaming a handler is a type error at every caller instead of a 404 at
 * runtime, and each dynamic segment must be supplied in `params`. The arguments are a union of
 * per-route tuples so that `apiRoute<Result>(route, init)` can still name the result type, which
 * a second generic for the route would not allow.
 */
export function apiRoute<T = unknown>(...[route, init]: ApiRouteArgs): Promise<T> {
  const { params, query, ...rest } = (init ?? {}) as RequestInit & {
    params?: Record<string, string | number | string[]>
    query?: Record<string, string | number | boolean | undefined>
  }
  return apiFetch<T>(routePath(route, params, query), rest)
}
