import { cache } from "react"

const XVM_API_BASE_URL = process.env.XVM_API_BASE_URL
const XVM_API_DASHBOARD_SERVICE_TOKEN = process.env.XVM_API_DASHBOARD_SERVICE_TOKEN

// ── Types ──────────────────────────────────────────────────────

export interface Credential {
  id: number
  kind: string
  client: string
  name: string
  preview: string
  venue_id: string | null
  issued_at: string
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
}

export interface CredentialIssued {
  secret: string
  credential: Credential
}

export interface MePerson {
  id: number
  display_name: string
}

export interface MeMembership {
  venue_id: string
  tier: string
}

export interface Me {
  kind: string
  client: string
  name: string
  venue_narrow: string | null
  person: MePerson | null
  memberships: MeMembership[]
}

type ReservationSource = string

export interface RoomImage {
  id: number
  image_url: string
  sort_order: number
}

export interface Reservation {
  id: number
  room_id: number
  reserved_person_id: number | null
  reserved_character_name: string | null
  reserved_world: string | null
  start_at: string
  end_at: string | null
  source: ReservationSource
  created_by_person_id: number | null
  created_at: string
  cancelled_at: string | null
  is_current: boolean
}

export interface Room {
  id: number
  venue_id: string
  owner_membership_id: number | null
  name: string | null
  notes: string | null
  room_number: number | null
  locked: boolean
  disabled: boolean
  updated_by_person_id: number | null
  created_at: string
  updated_at: string
  images: RoomImage[]
  current_reservation: Reservation | null
  status: string
}

export interface RoomCreate {
  name?: string | null
  notes?: string | null
  owner_membership_id?: number | null
  room_number?: number | null
  locked?: boolean
  disabled?: boolean
}

export interface RoomUpdate {
  name?: string | null
  notes?: string | null
  owner_membership_id?: number | null
  room_number?: number | null
  locked?: boolean | null
  disabled?: boolean | null
}

export interface ReservationCreate {
  reserved_person_id?: number | null
  reserved_character_name?: string | null
  reserved_world?: string | null
  start_at: string
  end_at?: string | null
  source: ReservationSource
}

export interface RuleRow {
  interval: string
  weekday: number | null
  day_of_month: number | null
  week_of_month: number | null
  start_minute_of_day: number
  duration_minutes: number
  timezone: string
  anchor_date: string
  ends_on: string | null
  ends_after_count: number | null
  enabled: boolean
}

export interface HoursRow {
  id: number
  label: string | null
  source: string
  rule: RuleRow
}

export interface HoursCreate {
  label?: string | null
  interval: string
  weekday?: number | null
  day_of_month?: number | null
  week_of_month?: number | null
  start_minute_of_day: number
  duration_minutes: number
  timezone?: string | null
  anchor_date: string
  ends_on?: string | null
  ends_after_count?: number | null
}

export interface HoursUpdate {
  label?: string | null
  enabled?: boolean | null
}

export interface OpeningRow {
  hours_id: number
  label: string | null
  starts_at: string
  ends_at: string
}

export interface OpenNow {
  open: boolean
  current: OpeningRow | null
  next: OpeningRow | null
}

// ── Venues API ─────────────────────────────────────────────────

export interface VenueCreate {
  name: string
  slug?: string | null
  data_center: string
  world: string
}

export interface VenueRow {
  id: string
  name: string
  slug: string
  data_center: string
  world: string
}

export interface VenueImageRow {
  id: number
  image_url: string
  sort_order: number
}

export interface VenueLinkRow {
  id: number
  provider: string
  external_id: string
  linked_at: string
  linked_by_person_id: number | null
  last_synced_at: string | null
  unlinked_at: string | null
}

export type TaskVisibility = "all" | "assigned" | "assigned_unassigned"
export type SalesVisibility = "all" | "own" | "none"
export type RevenueVisibility = "all" | "hide" | "own"
export type EventVisibility = "all" | "published"

export interface VenueDetail {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  banner_url: string | null
  venue_type: string | null
  data_center: string
  world: string
  district: string | null
  ward: number | null
  plot: number | null
  apartment: number | null
  room: number | null
  subdivision: boolean | null
  timezone: string
  currency_name: string
  task_visibility: TaskVisibility
  sales_visibility: SalesVisibility
  revenue_visibility: RevenueVisibility
  event_visibility: EventVisibility
  is_active: boolean
  created_at: string
  updated_at: string
  images: VenueImageRow[]
  external_links: VenueLinkRow[]
}

export interface VenueUpdate {
  name?: string
  description?: string | null
  logo_url?: string | null
  banner_url?: string | null
  venue_type?: string | null
  data_center?: string
  world?: string
  district?: string | null
  ward?: number | null
  plot?: number | null
  apartment?: number | null
  room?: number | null
  subdivision?: boolean | null
  timezone?: string
  currency_name?: string
  task_visibility?: TaskVisibility
  sales_visibility?: SalesVisibility
  revenue_visibility?: RevenueVisibility
  event_visibility?: EventVisibility
}

// ── Internal fetch helper ──────────────────────────────────────

// Carries the upstream HTTP status so callers can distinguish "xvm-api
// rejected this request" (4xx to forward as-is) from "our token is bad"
// (401, handled by invalidating the stored credential).
export class XvmApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`xvm-api ${status}: ${body}`)
  }
}

// xvm-api's explicit ErrorDetail schema is {detail: string}, but FastAPI's own
// 422 validation responses (bad query/body shape, or a Pydantic model_validator
// raising ValueError) use {detail: [{msg: string, ...}, ...]} instead - err.body
// is the raw response text either way, so forwarding it as-is renders a JSON
// blob to the user instead of the message.
export function xvmErrorMessage(err: XvmApiError): string {
  try {
    const parsed = JSON.parse(err.body)
    if (typeof parsed?.detail === "string") return parsed.detail
    if (Array.isArray(parsed?.detail)) {
      const messages = parsed.detail
        .map((d: unknown) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : null))
        .filter((m: string | null): m is string => m !== null)
      if (messages.length > 0) return messages.join("; ")
    }
  } catch {
    // body wasn't JSON, fall through to the raw text below
  }
  return err.body || err.message
}

async function xvmFetch<T>(path: string, options: RequestInit = {}, bearerToken?: string): Promise<T> {
  const headers: Record<string, string> = {}
  // FormData bodies must NOT get an explicit Content-Type - fetch generates the
  // multipart boundary itself and only does so when it owns the header.
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
  }
  if (bearerToken) {
    headers["Authorization"] = `Bearer ${bearerToken}`
  }
  const res = await fetch(`${XVM_API_BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new XvmApiError(res.status, body)
  }
  // 204 (no content) and 202 (accepted - bot does the work async, no body)
  // both come back with nothing to parse; res.json() throws on an empty body.
  return res.status === 204 || res.status === 202 ? (null as T) : res.json()
}

// ── Auth ───────────────────────────────────────────────────────

export async function exchangeToken(externalId: string, displayName: string): Promise<CredentialIssued> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  if (!process.env.XVM_API_DASHBOARD_SERVICE_TOKEN) throw new Error("XVM_API_DASHBOARD_SERVICE_TOKEN is not set")
  return xvmFetch<CredentialIssued>(
    "/internal/tokens/exchange",
    {
      method: "POST",
      body: JSON.stringify({ provider: "discord", external_id: externalId, display_name: displayName }),
    },
    XVM_API_DASHBOARD_SERVICE_TOKEN
  )
}

// ── Person API ─────────────────────────────────────────────────

export async function getMe(personToken: string): Promise<Me> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Me>("/me", {}, personToken)
}

export async function listMyCredentials(personToken: string): Promise<Credential[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Credential[]>("/me/credentials", {}, personToken)
}

export async function revokeCredential(personToken: string, credentialId: number): Promise<Credential> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Credential>(`/me/credentials/${credentialId}/revoke`, { method: "POST" }, personToken)
}

// ── Rooms API ──────────────────────────────────────────────────

export async function listRooms(personToken: string, venueId: string): Promise<Room[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Room[]>(`/venues/${venueId}/rooms`, {}, personToken)
}

export async function getRoom(personToken: string, venueId: string, roomId: number): Promise<Room> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Room>(`/venues/${venueId}/rooms/${roomId}`, {}, personToken)
}

export async function createRoom(personToken: string, venueId: string, data: RoomCreate): Promise<Room> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Room>(`/venues/${venueId}/rooms`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function updateRoom(
  personToken: string,
  venueId: string,
  roomId: number,
  data: RoomUpdate
): Promise<Room> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Room>(`/venues/${venueId}/rooms/${roomId}`, { method: "PATCH", body: JSON.stringify(data) }, personToken)
}

export async function deleteRoom(personToken: string, venueId: string, roomId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/rooms/${roomId}`, { method: "DELETE" }, personToken)
}

export async function listReservations(personToken: string, venueId: string, roomId: number): Promise<Reservation[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Reservation[]>(`/venues/${venueId}/rooms/${roomId}/reservations`, {}, personToken)
}

export async function createReservation(
  personToken: string,
  venueId: string,
  roomId: number,
  data: ReservationCreate
): Promise<Reservation> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Reservation>(
    `/venues/${venueId}/rooms/${roomId}/reservations`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function releaseRoom(personToken: string, venueId: string, roomId: number): Promise<Room> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Room>(`/venues/${venueId}/rooms/${roomId}/release`, { method: "POST" }, personToken)
}

export async function cancelReservation(
  personToken: string,
  venueId: string,
  roomId: number,
  reservationId: number
): Promise<Reservation> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Reservation>(
    `/venues/${venueId}/rooms/${roomId}/reservations/${reservationId}/cancel`,
    { method: "POST" },
    personToken
  )
}

// xvm-api's gallery POSTs take multipart bytes now (validated, re-encoded to WebP
// server-side), not a JSON {image_url} - `file` is whatever the browser's <input
// type="file"> or a drag-drop handler already hands you.
export async function uploadRoomImage(
  personToken: string,
  venueId: string,
  roomId: number,
  file: File | Blob
): Promise<RoomImage> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const form = new FormData()
  form.append("file", file)
  return xvmFetch<RoomImage>(
    `/venues/${venueId}/rooms/${roomId}/images`,
    { method: "POST", body: form },
    personToken
  )
}

// ── Reaction Role Panels API ─────────────────────────────────────

export interface ReactionRoleOptionRow {
  id: number
  role_id: string
  label: string | null
  emoji: string | null
  sort_order: number
}

export interface PanelRow {
  id: number
  title: string | null
  description: string | null
  thumbnail_url: string | null
  color: number | null
  message_type: "normal" | "unique" | "verify"
  options: ReactionRoleOptionRow[]
  created_at: string
  updated_at: string
}

export interface PanelPostRow {
  channel_id: string
  message_id: string | null
  posted_at: string | null
}

export interface TemplateOptionRow {
  id: number
  name: string
  color: number
  emoji: string | null
  sort_order: number
}

export interface TemplateRow {
  id: number
  name: string
  title: string
  description: string | null
  message_type: "normal" | "unique" | "verify"
  options: TemplateOptionRow[]
  created_at: string
  updated_at: string
}

export interface PanelCreateData {
  title: string
  description?: string | null
  color?: number | null
  message_type?: "normal" | "unique" | "verify"
}

export interface PanelUpdateData {
  title?: string
  description?: string | null
  color?: number | null
  message_type?: "normal" | "unique" | "verify"
}

export interface PanelOptionCreateData {
  role_id: string
  label?: string | null
  emoji?: string | null
}

export interface PanelOptionUpdateData {
  label?: string | null
  emoji?: string | null
}

export async function listPanels(personToken: string, venueId: string): Promise<PanelRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PanelRow[]>(`/venues/${venueId}/reaction-role-panels`, {}, personToken)
}

export async function getPanel(personToken: string, venueId: string, panelId: number): Promise<PanelRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PanelRow>(`/venues/${venueId}/reaction-role-panels/${panelId}`, {}, personToken)
}

export async function createPanel(personToken: string, venueId: string, data: PanelCreateData): Promise<PanelRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PanelRow>(
    `/venues/${venueId}/reaction-role-panels`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updatePanel(
  personToken: string,
  venueId: string,
  panelId: number,
  data: PanelUpdateData
): Promise<PanelRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PanelRow>(
    `/venues/${venueId}/reaction-role-panels/${panelId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deletePanel(personToken: string, venueId: string, panelId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/reaction-role-panels/${panelId}`, { method: "DELETE" }, personToken)
}

export async function setPanelThumbnail(
  personToken: string,
  venueId: string,
  panelId: number,
  file: File | Blob
): Promise<PanelRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const form = new FormData()
  form.append("file", file)
  return xvmFetch<PanelRow>(
    `/venues/${venueId}/reaction-role-panels/${panelId}/thumbnail`,
    { method: "PUT", body: form },
    personToken
  )
}

export async function addPanelOption(
  personToken: string,
  venueId: string,
  panelId: number,
  data: PanelOptionCreateData
): Promise<ReactionRoleOptionRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ReactionRoleOptionRow>(
    `/venues/${venueId}/reaction-role-panels/${panelId}/options`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updatePanelOption(
  personToken: string,
  venueId: string,
  panelId: number,
  optionId: number,
  data: PanelOptionUpdateData
): Promise<ReactionRoleOptionRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ReactionRoleOptionRow>(
    `/venues/${venueId}/reaction-role-panels/${panelId}/options/${optionId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deletePanelOption(
  personToken: string,
  venueId: string,
  panelId: number,
  optionId: number
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/reaction-role-panels/${panelId}/options/${optionId}`,
    { method: "DELETE" },
    personToken
  )
}

// Both endpoints below return 202 with no body - the bot does the work
// asynchronously. Callers poll listPanels/listPanelPosts to find out.

export async function applyPanelTemplate(
  personToken: string,
  venueId: string,
  data: { template_id: number; channel_id: string }
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/reaction-role-panels/from-template`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function postPanel(
  personToken: string,
  venueId: string,
  panelId: number,
  data: { channel_id: string }
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/reaction-role-panels/${panelId}/posts`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function listPanelPosts(personToken: string, venueId: string, panelId: number): Promise<PanelPostRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PanelPostRow[]>(`/venues/${venueId}/reaction-role-panels/${panelId}/posts`, {}, personToken)
}

// Not venue-scoped in xvm-api - templates are a flat, platform-wide catalog
// (admin_router with no prefix). Read-only here; creation is platform-admin-only.
export async function listReactionRoleTemplates(personToken: string): Promise<TemplateRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TemplateRow[]>("/reaction-role-templates", {}, personToken)
}

export async function deleteRoomImage(
  personToken: string,
  venueId: string,
  roomId: number,
  imageId: number
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/rooms/${roomId}/images/${imageId}`, { method: "DELETE" }, personToken)
}

export interface VenueImage {
  id: number
  image_url: string
  sort_order: number
}

export async function uploadVenueImage(
  personToken: string,
  venueId: string,
  file: File | Blob
): Promise<VenueImage> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const form = new FormData()
  form.append("file", file)
  return xvmFetch<VenueImage>(`/venues/${venueId}/images`, { method: "POST", body: form }, personToken)
}

export async function deleteVenueImage(personToken: string, venueId: string, imageId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/images/${imageId}`, { method: "DELETE" }, personToken)
}

export async function createVenue(personToken: string, data: VenueCreate): Promise<VenueRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<VenueRow>("/venues", { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function getVenue(personToken: string, venueId: string): Promise<VenueDetail> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<VenueDetail>(`/venues/${venueId}`, {}, personToken)
}

export async function updateVenue(personToken: string, venueId: string, data: VenueUpdate): Promise<VenueDetail> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<VenueDetail>(`/venues/${venueId}`, { method: "PATCH", body: JSON.stringify(data) }, personToken)
}

// ── Venue Hours API ────────────────────────────────────────────

export async function listHours(personToken: string, venueId: string): Promise<HoursRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<HoursRow[]>(`/venues/${venueId}/hours`, {}, personToken)
}

export async function createHours(personToken: string, venueId: string, data: HoursCreate): Promise<HoursRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<HoursRow>(`/venues/${venueId}/hours`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function updateHours(
  personToken: string,
  venueId: string,
  hoursId: number,
  data: HoursUpdate
): Promise<HoursRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<HoursRow>(`/venues/${venueId}/hours/${hoursId}`, { method: "PATCH", body: JSON.stringify(data) }, personToken)
}

export async function deleteHours(personToken: string, venueId: string, hoursId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/hours/${hoursId}`, { method: "DELETE" }, personToken)
}

// from/to are ISO instants; the API caps the window at 60 days and 400s on an
// inverted or oversized range.
export async function listOpenings(
  personToken: string,
  venueId: string,
  from: string,
  to: string
): Promise<OpeningRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams({ from, to })
  return xvmFetch<OpeningRow[]>(`/venues/${venueId}/hours/openings?${params}`, {}, personToken)
}

export async function getOpenNow(personToken: string, venueId: string, at?: string): Promise<OpenNow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = at ? `?${new URLSearchParams({ at })}` : ""
  return xvmFetch<OpenNow>(`/venues/${venueId}/hours/now${params}`, {}, personToken)
}

// Unauthenticated - no bearerToken param, matching the endpoint's own
// unauthenticated public/venues/{id}/hours contract for anonymous page renders.
export interface PublicHours {
  open_now: OpenNow
  rules: HoursRow[]
  upcoming: OpeningRow[]
}

export async function getPublicHours(venueId: string, days?: number): Promise<PublicHours> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = days !== undefined ? `?${new URLSearchParams({ days: String(days) })}` : ""
  // Cached and revalidated rather than fetched fresh on every render - this
  // endpoint's 30 req/min/IP budget is shared across every public venue page
  // view site-wide via the dashboard server's one outbound IP, and hours data
  // changes rarely enough that a short revalidation window is unnoticeable.
  return xvmFetch<PublicHours>(`/public/venues/${venueId}/hours${params}`, { next: { revalidate: 60 } })
}

export interface PublicVenue {
  id: string
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  banner_url: string | null
  venue_type: string | null
  data_center: string
  world: string
  district: string | null
  ward: number | null
  plot: number | null
  apartment: number | null
  room: number | null
  subdivision: boolean | null
  timezone: string
  images: VenueImageRow[]
}

// React's per-request cache() on top of the fetch-level revalidate: 60 below -
// generateMetadata and the page component both call this for the same venue
// in one render pass, and against a shared 60 req/min public rate limiter
// (see xvm-api#77) a duplicate call within a single request is pure waste.
export const getPublicVenue = cache(async (venueId: string): Promise<PublicVenue> => {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  // Same shared public rate limiter as getPublicHours - cached for the same reason.
  return xvmFetch<PublicVenue>(`/public/venues/${venueId}`, { next: { revalidate: 60 } })
})

export interface PublicHoursBatch {
  venues: Record<string, PublicHours>
}

export async function getPublicHoursBatch(venueIds: string[], days?: number): Promise<PublicHoursBatch> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  if (venueIds.length === 0) return { venues: {} }
  const params = new URLSearchParams({ ids: venueIds.join(",") })
  if (days !== undefined) params.set("days", String(days))
  return xvmFetch<PublicHoursBatch>(`/public/venues/hours?${params}`, { next: { revalidate: 60 } })
}

// xvm-api caps one batch read at PUBLIC_HOURS_BATCH_MAX ids - this wraps
// getPublicHoursBatch with chunking and merging so callers with more ids
// (Following is unbounded) don't silently lose venues past the first batch.
export const PUBLIC_HOURS_BATCH_MAX = 50

export async function getPublicHoursForVenues(
  venueIds: string[],
  days?: number
): Promise<Record<string, PublicHours>> {
  const merged: Record<string, PublicHours> = {}
  for (let i = 0; i < venueIds.length; i += PUBLIC_HOURS_BATCH_MAX) {
    const batch = await getPublicHoursBatch(venueIds.slice(i, i + PUBLIC_HOURS_BATCH_MAX), days)
    Object.assign(merged, batch.venues)
  }
  return merged
}

export interface PublicVenueBatch {
  venues: Record<string, PublicVenue>
}

export async function getPublicVenueBatch(venueIds: string[]): Promise<PublicVenueBatch> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  if (venueIds.length === 0) return { venues: {} }
  const params = new URLSearchParams({ ids: venueIds.join(",") })
  return xvmFetch<PublicVenueBatch>(`/public/venues?${params}`, { next: { revalidate: 60 } })
}

// Shares xvm-api's PUBLIC_HOURS_BATCH_MAX cap (xvm-api#78) - chunking and
// merging so callers with more ids (Following is unbounded) don't silently
// lose venues past the first batch. A venue that fails, doesn't exist, or is
// deactivated is simply absent from the result, matching the no-Prisma-
// fallback pattern every caller of this already applies for hours.
export async function getPublicVenuesForIds(venueIds: string[]): Promise<Record<string, PublicVenue>> {
  const merged: Record<string, PublicVenue> = {}
  for (let i = 0; i < venueIds.length; i += PUBLIC_HOURS_BATCH_MAX) {
    try {
      const batch = await getPublicVenueBatch(venueIds.slice(i, i + PUBLIC_HOURS_BATCH_MAX))
      Object.assign(merged, batch.venues)
    } catch {
      // whole chunk failed - those venues are simply absent, no partial retry
    }
  }
  return merged
}

// ── Positions API ──────────────────────────────────────────────

export interface PositionCreate {
  name: string
  color?: number | null
  responsibilities?: string | null
  hourly_rate_minor?: number | null
  discord_role_id?: number | null
}

export interface PositionUpdate {
  name?: string | null
  color?: number | null
  responsibilities?: string | null
  hourly_rate_minor?: number | null
  discord_role_id?: number | null
}

export interface PositionRow {
  id: number
  name: string
  color: number | null
  responsibilities: string | null
  hourly_rate_minor: number | null
  pot_payout_mode: string
  contractor_shares_pot: boolean
  discord_role_id: number | null
  member_ids: number[]
}

export async function listPositions(personToken: string, venueId: string): Promise<PositionRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PositionRow[]>(`/venues/${venueId}/positions`, {}, personToken)
}

export async function createPosition(
  personToken: string,
  venueId: string,
  data: PositionCreate
): Promise<PositionRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PositionRow>(
    `/venues/${venueId}/positions`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updatePosition(
  personToken: string,
  venueId: string,
  positionId: number,
  data: PositionUpdate
): Promise<PositionRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PositionRow>(
    `/venues/${venueId}/positions/${positionId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function assignPositionMember(
  personToken: string,
  venueId: string,
  positionId: number,
  membershipId: number
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/positions/${positionId}/members`,
    { method: "POST", body: JSON.stringify({ membership_id: membershipId }) },
    personToken
  )
}

export async function deletePosition(personToken: string, venueId: string, positionId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/positions/${positionId}`, { method: "DELETE" }, personToken)
}

// ── Memberships API ────────────────────────────────────────────

export interface MembershipPerson {
  id: number
  display_name: string
  discord_id: string | null
}

export interface MembershipRow {
  id: number
  venue_id: string
  person: MembershipPerson
  nickname: string | null
  tier: string
  effective_tier: string
  is_employed: boolean
  position_ids: number[]
}

export async function listMemberships(personToken: string, venueId: string): Promise<MembershipRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow[]>(`/venues/${venueId}/memberships`, {}, personToken)
}

export interface InviteRow {
  id: number
  person: MembershipPerson
  tier: string
  expires_at: string
  invited_by_person_id: number | null
}

export interface InviteIssued extends InviteRow {
  token: string
}

export async function setNickname(
  personToken: string,
  venueId: string,
  membershipId: number,
  nickname: string | null
): Promise<MembershipRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow>(
    `/venues/${venueId}/memberships/${membershipId}/nickname`,
    { method: "PATCH", body: JSON.stringify({ nickname }) },
    personToken
  )
}

export async function setTier(
  personToken: string,
  venueId: string,
  membershipId: number,
  tier: "owner" | "manager" | "staff"
): Promise<MembershipRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow>(
    `/venues/${venueId}/memberships/${membershipId}/tier`,
    { method: "PUT", body: JSON.stringify({ tier }) },
    personToken
  )
}

export interface TierGrantRow {
  id: number
  tier: string
  granted_at: string
  expires_at: string | null
  granted_by_person_id: number | null
  revoked_at: string | null
  is_live: boolean
}

// Deputise a member to manager until a stated moment. xvm-api hard-codes the
// grantable tier to "manager" (Literal["manager"] server-side) and requires
// expires_at - there is no untimed grant, that's just PUT tier.
export async function grantTier(
  personToken: string,
  venueId: string,
  membershipId: number,
  expiresAt: string
): Promise<TierGrantRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TierGrantRow>(
    `/venues/${venueId}/memberships/${membershipId}/tier-grants`,
    { method: "POST", body: JSON.stringify({ tier: "manager", expires_at: expiresAt }) },
    personToken
  )
}

export async function listTierGrants(
  personToken: string,
  venueId: string,
  membershipId: number
): Promise<TierGrantRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TierGrantRow[]>(`/venues/${venueId}/memberships/${membershipId}/tier-grants`, {}, personToken)
}

export async function revokeTierGrant(
  personToken: string,
  venueId: string,
  membershipId: number,
  grantId: number
): Promise<TierGrantRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TierGrantRow>(
    `/venues/${venueId}/memberships/${membershipId}/tier-grants/${grantId}/revoke`,
    { method: "POST" },
    personToken
  )
}

export async function terminateMembership(
  personToken: string,
  venueId: string,
  membershipId: number,
  reason?: string | null
): Promise<MembershipRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow>(
    `/venues/${venueId}/memberships/${membershipId}/terminate`,
    { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
    personToken
  )
}

export async function rehireMembership(
  personToken: string,
  venueId: string,
  membershipId: number
): Promise<MembershipRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow>(
    `/venues/${venueId}/memberships/${membershipId}/rehire`,
    { method: "POST" },
    personToken
  )
}

export async function createInvite(
  personToken: string,
  venueId: string,
  data: { display_name: string; tier: "owner" | "manager" | "staff"; external_id?: string | null }
): Promise<InviteIssued> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<InviteIssued>(
    `/venues/${venueId}/invites`,
    { method: "POST", body: JSON.stringify({ provider: "discord", ...data }) },
    personToken
  )
}

export async function listInvites(personToken: string, venueId: string): Promise<InviteRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<InviteRow[]>(`/venues/${venueId}/invites`, {}, personToken)
}

export async function rescindInvite(personToken: string, venueId: string, inviteId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/invites/${inviteId}`, { method: "DELETE" }, personToken)
}

export interface InvitePreview {
  venue: { name: string; slug: string }
  tier: string
  invited_name: string
  invited_by_name: string | null
  expires_at: string
}

// Public, unauthenticated - no bearer token, matches xvm-api's unlocked
// preview lookup for the pre-signin invite screen.
export async function getInvitePreview(token: string): Promise<InvitePreview> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<InvitePreview>(`/invites/${token}`)
}

// Not venue-scoped - the invitee isn't a member yet, so this takes a bare
// person token rather than the venue-narrowed one other membership calls use.
export async function acceptInvite(personToken: string, token: string): Promise<MembershipRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow>("/invites/accept", { method: "POST", body: JSON.stringify({ token }) }, personToken)
}

// setMembershipPositions wraps the atomic PUT (xvm-api PR #56, merged 2026-09-01):
// venues/{id}/memberships/{id}/positions, {position_ids: [...]} -> MembershipRow.
// Reconciles server-side under the membership's row lock (add+remove in one
// transaction, idempotent re-save, all-or-nothing on a bad set). Use this for
// Task 4/9. For single-toggle call sites, use the existing assignPositionMember
// (above) and removePositionMemberFromMembership (below) instead.
export async function setMembershipPositions(
  personToken: string,
  venueId: string,
  membershipId: number,
  positionIds: number[]
): Promise<MembershipRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow>(
    `/venues/${venueId}/memberships/${membershipId}/positions`,
    { method: "PUT", body: JSON.stringify({ position_ids: positionIds }) },
    personToken
  )
}

export async function removePositionMemberFromMembership(
  personToken: string,
  venueId: string,
  positionId: number,
  membershipId: number
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/positions/${positionId}/members/${membershipId}`,
    { method: "DELETE" },
    personToken
  )
}

export interface ShiftStaffOption {
  // A membership id, not a person id - ShiftCreate.membership_id validates
  // against the venue's memberships, and person/membership ids can collide
  // (both are separate autoincrement sequences).
  id: number
  name: string
  image: string | null
}

export interface ShiftRoleOption {
  id: number
  name: string
}

// Bridges the two lists CreateShiftDialog/page.tsx need for its staff/role
// pickers into the shape those components already expect. Character-name
// resolution is intentionally not attempted here - MembershipPerson only
// carries display_name, see shift-format.ts's staffNameOf for the same
// constraint on the read side.
export async function listShiftStaffAndRoles(
  personToken: string,
  venueId: string
): Promise<{ staff: ShiftStaffOption[]; roles: ShiftRoleOption[] }> {
  const [memberships, positions] = await Promise.all([
    listMemberships(personToken, venueId),
    listPositions(personToken, venueId),
  ])
  return {
    staff: memberships
      .filter((m) => m.is_employed)
      .map((m) => ({ id: m.id, name: m.person.display_name, image: null })),
    roles: positions.map((p) => ({ id: p.id, name: p.name })),
  }
}

// ── Shifts API ─────────────────────────────────────────────────
// Recurrence (recurrence_rule_id) is schema-only on xvm-api right now - no series/pattern
// endpoints exist yet, so this client only covers one-off shifts.

export type ShiftApiStatus =
  | "open"
  | "pending_approval"
  | "scheduled"
  | "active"
  | "completed"
  | "cancelled"
  | "missed"
  | "unfilled"

export interface ShiftRow {
  id: number
  membership_id: number | null
  position_id: number | null
  event_id: number | null
  recurrence_rule_id: number | null
  slot_index: number
  scheduled_start: string | null
  scheduled_end: string | null
  actual_start: string | null
  actual_end: string | null
  auto_closed_at: string | null
  claimed_at: string | null
  approved_at: string | null
  approved_by_person_id: number | null
  cancelled_at: string | null
  cancel_reason: string | null
  notes: string | null
  payroll_entry_id: number | null
  worked_minutes: number | null
  status: ShiftApiStatus
  created_at: string
  updated_at: string
}

export interface ShiftCreate {
  scheduled_start: string
  scheduled_end: string
  position_id?: number | null
  membership_id?: number | null
  event_id?: number | null
  notes?: string | null
}

export interface ShiftAuditRow {
  id: number
  action: string
  actor_person_id: number | null
  source: string
  note: string | null
  created_at: string
}

export async function listShifts(
  personToken: string,
  venueId: string,
  opts: { from: string; to: string; openOnly?: boolean; mine?: boolean; includeCancelled?: boolean }
): Promise<ShiftRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams({ from: opts.from, to: opts.to })
  if (opts.openOnly) params.set("open_only", "true")
  if (opts.mine) params.set("mine", "true")
  if (opts.includeCancelled) params.set("include_cancelled", "true")
  return xvmFetch<ShiftRow[]>(`/venues/${venueId}/shifts?${params}`, {}, personToken)
}

// xvm-api rejects a from/to window over 60 days (400, "Windows are capped at
// 60 days"). Callers wanting a wider range (the shifts calendar's 6-month
// rolling window) chunk through this instead of listShifts directly.
export const LIST_SHIFTS_MAX_WINDOW_DAYS = 60

export async function listShiftsChunked(
  personToken: string,
  venueId: string,
  opts: { from: string; to: string; openOnly?: boolean; mine?: boolean; includeCancelled?: boolean }
): Promise<ShiftRow[]> {
  const from = new Date(opts.from)
  const to = new Date(opts.to)
  const chunks: { from: string; to: string }[] = []
  let chunkStart = from
  while (chunkStart < to) {
    const chunkEnd = new Date(
      Math.min(chunkStart.getTime() + (LIST_SHIFTS_MAX_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000, to.getTime())
    )
    chunks.push({ from: chunkStart.toISOString(), to: chunkEnd.toISOString() })
    chunkStart = chunkEnd
  }
  const results = await Promise.all(
    chunks.map((c) => listShifts(personToken, venueId, { ...opts, from: c.from, to: c.to }))
  )
  const byId = new Map<number, ShiftRow>()
  for (const shift of results.flat()) byId.set(shift.id, shift)
  return [...byId.values()]
}

export async function getShift(personToken: string, venueId: string, shiftId: number): Promise<ShiftRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ShiftRow>(`/venues/${venueId}/shifts/${shiftId}`, {}, personToken)
}

export async function createShift(personToken: string, venueId: string, data: ShiftCreate): Promise<ShiftRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ShiftRow>(`/venues/${venueId}/shifts`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function claimShift(personToken: string, venueId: string, shiftId: number): Promise<ShiftRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ShiftRow>(`/venues/${venueId}/shifts/${shiftId}/claim`, { method: "POST" }, personToken)
}

export async function approveShift(personToken: string, venueId: string, shiftId: number): Promise<ShiftRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ShiftRow>(`/venues/${venueId}/shifts/${shiftId}/approve`, { method: "POST" }, personToken)
}

export async function rejectShift(
  personToken: string,
  venueId: string,
  shiftId: number,
  note?: string | null
): Promise<ShiftRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ShiftRow>(
    `/venues/${venueId}/shifts/${shiftId}/reject`,
    { method: "POST", body: JSON.stringify({ note: note ?? null }) },
    personToken
  )
}

export async function assignShift(
  personToken: string,
  venueId: string,
  shiftId: number,
  membershipId: number
): Promise<ShiftRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ShiftRow>(
    `/venues/${venueId}/shifts/${shiftId}/assign`,
    { method: "POST", body: JSON.stringify({ membership_id: membershipId }) },
    personToken
  )
}

export async function clockInShift(personToken: string, venueId: string, shiftId: number): Promise<ShiftRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ShiftRow>(`/venues/${venueId}/shifts/${shiftId}/clock-in`, { method: "POST" }, personToken)
}

export async function clockOutShift(personToken: string, venueId: string, shiftId: number): Promise<ShiftRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ShiftRow>(`/venues/${venueId}/shifts/${shiftId}/clock-out`, { method: "POST" }, personToken)
}

export async function cancelShift(
  personToken: string,
  venueId: string,
  shiftId: number,
  reason?: string | null
): Promise<ShiftRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ShiftRow>(
    `/venues/${venueId}/shifts/${shiftId}/cancel`,
    { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
    personToken
  )
}

export async function getShiftAudit(
  personToken: string,
  venueId: string,
  shiftId: number
): Promise<ShiftAuditRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ShiftAuditRow[]>(`/venues/${venueId}/shifts/${shiftId}/audit`, {}, personToken)
}

// ── Tasks API ──────────────────────────────────────────────────

export interface CategoryRow {
  id: number
  name: string
  sort_order: number
}

export async function listTaskCategories(personToken: string, venueId: string): Promise<CategoryRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<CategoryRow[]>(`/venues/${venueId}/tasks/categories`, {}, personToken)
}

export async function createTaskCategory(personToken: string, venueId: string, name: string): Promise<CategoryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<CategoryRow>(
    `/venues/${venueId}/tasks/categories`,
    { method: "POST", body: JSON.stringify({ name, sort_order: 0 }) },
    personToken
  )
}

export interface TaskRow {
  id: number
  title: string
  description: string | null
  priority: number
  due_at: string | null
  category_id: number | null
  assigned_membership_id: number | null
  assigned_position_id: number | null
  started_at: string | null
  completed_at: string | null
  completed_by_person_id: number | null
  cancelled_at: string | null
  cancel_reason: string | null
  created_by_person_id: number | null
  created_at: string
  updated_at: string
}

export interface TaskCreateData {
  title: string
  description?: string | null
  priority?: number
  due_at?: string | null
  category_id?: number | null
  assigned_membership_id?: number | null
  assigned_position_id?: number | null
}

export interface TaskUpdateData {
  title?: string
  description?: string | null
  priority?: number
  due_at?: string | null
  category_id?: number | null
}

export interface TaskAssignData {
  membership_id?: number | null
  position_id?: number | null
}

export async function listTasks(
  personToken: string,
  venueId: string,
  options: { includeCompleted?: boolean; includeCancelled?: boolean; categoryId?: number } = {}
): Promise<TaskRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams()
  if (options.includeCompleted) params.set("include_completed", "true")
  if (options.includeCancelled) params.set("include_cancelled", "true")
  if (options.categoryId !== undefined) params.set("category_id", String(options.categoryId))
  const query = params.toString() ? `?${params}` : ""
  return xvmFetch<TaskRow[]>(`/venues/${venueId}/tasks${query}`, {}, personToken)
}

export async function createTask(personToken: string, venueId: string, data: TaskCreateData): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function updateTask(personToken: string, venueId: string, taskId: number, data: TaskUpdateData): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(data) }, personToken)
}

export async function assignTask(personToken: string, venueId: string, taskId: number, data: TaskAssignData): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks/${taskId}/assign`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function startTask(personToken: string, venueId: string, taskId: number): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks/${taskId}/start`, { method: "POST" }, personToken)
}

export async function completeTask(personToken: string, venueId: string, taskId: number): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks/${taskId}/complete`, { method: "POST" }, personToken)
}

export async function cancelTask(personToken: string, venueId: string, taskId: number, reason?: string | null): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(
    `/venues/${venueId}/tasks/${taskId}/cancel`,
    { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
    personToken
  )
}

// ── Event Templates API ───────────────────────────────────────────

export interface EventTemplateRow {
  id: number
  name: string
  title: string
  description: string | null
  event_type: string | null
  default_start_minute_of_day: number
  default_duration_minutes: number
}

export interface EventTemplateCreateData {
  name: string
  title: string
  description?: string | null
  event_type?: string | null
  default_start_minute_of_day: number
  default_duration_minutes: number
}

export interface EventTemplateUpdateData {
  name?: string
  title?: string
  description?: string | null
  event_type?: string | null
  default_start_minute_of_day?: number
  default_duration_minutes?: number
}

export async function listEventTemplates(personToken: string, venueId: string): Promise<EventTemplateRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EventTemplateRow[]>(`/venues/${venueId}/events/templates`, {}, personToken)
}

export async function createEventTemplate(
  personToken: string,
  venueId: string,
  data: EventTemplateCreateData
): Promise<EventTemplateRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EventTemplateRow>(
    `/venues/${venueId}/events/templates`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updateEventTemplate(
  personToken: string,
  venueId: string,
  templateId: number,
  data: EventTemplateUpdateData
): Promise<EventTemplateRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EventTemplateRow>(
    `/venues/${venueId}/events/templates/${templateId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deleteEventTemplate(personToken: string, venueId: string, templateId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/events/templates/${templateId}`, { method: "DELETE" }, personToken)
}

// ── Patrons API ────────────────────────────────────────────────

export interface PatronRow {
  id: number
  character_name: string
  world: string
  is_banned: boolean
  ban_reason: string | null
  banned_at: string | null
  banned_by_person_id: number | null
  created_at: string
}

export interface PatronSummary extends PatronRow {
  visits: number
  last_seen: string | null
}

export async function listPatrons(personToken: string, venueId: string): Promise<PatronSummary[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PatronSummary[]>(`/venues/${venueId}/patrons`, {}, personToken)
}

export async function banPatron(
  personToken: string,
  venueId: string,
  patronId: number,
  reason: string
): Promise<PatronRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PatronRow>(
    `/venues/${venueId}/patrons/${patronId}/ban`,
    { method: "PATCH", body: JSON.stringify({ reason }) },
    personToken
  )
}

export async function unbanPatron(personToken: string, venueId: string, patronId: number): Promise<PatronRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PatronRow>(`/venues/${venueId}/patrons/${patronId}/ban`, { method: "DELETE" }, personToken)
}

export interface BannedRow {
  character_name: string
  world: string
  ban_reason: string | null
}

export async function listBannedPatrons(personToken: string, venueId: string): Promise<BannedRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<BannedRow[]>(`/venues/${venueId}/patrons/banned`, {}, personToken)
}

export async function banPatronByName(
  personToken: string,
  venueId: string,
  characterName: string,
  world: string,
  reason: string
): Promise<PatronRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PatronRow>(
    `/venues/${venueId}/patrons/bans`,
    { method: "POST", body: JSON.stringify({ character_name: characterName, world, reason }) },
    personToken
  )
}

// ── Contests API ───────────────────────────────────────────────
//
// discord_user_id is xvm-api's Snowflake type, serialized as a JSON string -
// never parse it to a JS number, real Discord ids exceed Number.MAX_SAFE_INTEGER.

export interface GiveawayRow {
  id: number
  name: string | null
  description: string | null
  prize: string | null
  thumbnail_url: string | null
  color: number | null
  emoji: string | null
  end_at: string | null
  num_winners: number
  auto_notify: boolean
  entry_count: number
  rolled_at: string | null
  rolled_by_person_id: number | null
  created_at: string
}

export interface GiveawayCreate {
  name?: string | null
  description?: string | null
  prize?: string | null
  thumbnail_url?: string | null
  color?: number | null
  emoji?: string | null
  end_at?: string | null
  num_winners?: number
  auto_notify?: boolean
}

export interface GiveawayUpdate {
  name?: string | null
  description?: string | null
  prize?: string | null
  thumbnail_url?: string | null
  color?: number | null
  emoji?: string | null
  end_at?: string | null
  num_winners?: number | null
  auto_notify?: boolean | null
}

export interface EntryRow {
  discord_user_id: string
  quantity: number
  entered_at: string
  won_at: string | null
  winner_rank: number | null
}

export interface Winner {
  discord_user_id: string
  winner_rank: number
}

export interface GiveawayRoll {
  winners: Winner[]
}

export async function listGiveaways(
  personToken: string,
  venueId: string,
  options: { includeRolled?: boolean; limit?: number } = {}
): Promise<GiveawayRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams()
  if (options.includeRolled) params.set("include_rolled", "true")
  if (options.limit !== undefined) params.set("limit", String(options.limit))
  const query = params.toString() ? `?${params}` : ""
  return xvmFetch<GiveawayRow[]>(`/venues/${venueId}/giveaways${query}`, {}, personToken)
}

export async function createGiveaway(personToken: string, venueId: string, data: GiveawayCreate): Promise<GiveawayRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<GiveawayRow>(`/venues/${venueId}/giveaways`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function updateGiveaway(
  personToken: string,
  venueId: string,
  giveawayId: number,
  data: GiveawayUpdate
): Promise<GiveawayRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<GiveawayRow>(
    `/venues/${venueId}/giveaways/${giveawayId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deleteGiveaway(personToken: string, venueId: string, giveawayId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/giveaways/${giveawayId}`, { method: "DELETE" }, personToken)
}

export async function listGiveawayEntries(personToken: string, venueId: string, giveawayId: number): Promise<EntryRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EntryRow[]>(`/venues/${venueId}/giveaways/${giveawayId}/entries`, {}, personToken)
}

export async function rollGiveaway(personToken: string, venueId: string, giveawayId: number): Promise<GiveawayRoll> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<GiveawayRoll>(`/venues/${venueId}/giveaways/${giveawayId}/roll`, { method: "POST" }, personToken)
}

export interface RaffleRow {
  id: number
  name: string | null
  cost_per_ticket: number
  winner_basis_points: number
  num_winners: number
  auto_notify: boolean
  entry_count: number
  ticket_count: number
  pot: number
  rolled_at: string | null
  rolled_by_person_id: number | null
  created_at: string
}

export interface RaffleCreate {
  name?: string | null
  cost_per_ticket?: number
  winner_basis_points?: number
  num_winners?: number
  auto_notify?: boolean
}

export interface RaffleUpdate {
  name?: string | null
  cost_per_ticket?: number | null
  winner_basis_points?: number | null
  num_winners?: number | null
  auto_notify?: boolean | null
}

export interface TicketCredit {
  quantity?: number
}

export interface RaffleRoll {
  winners: Winner[]
  ticket_count: number
  pot: number
  winners_take: number
  venue_take: number
}

export async function listRaffles(
  personToken: string,
  venueId: string,
  options: { includeRolled?: boolean; limit?: number } = {}
): Promise<RaffleRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams()
  if (options.includeRolled) params.set("include_rolled", "true")
  if (options.limit !== undefined) params.set("limit", String(options.limit))
  const query = params.toString() ? `?${params}` : ""
  return xvmFetch<RaffleRow[]>(`/venues/${venueId}/raffles${query}`, {}, personToken)
}

export async function createRaffle(personToken: string, venueId: string, data: RaffleCreate): Promise<RaffleRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<RaffleRow>(`/venues/${venueId}/raffles`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function updateRaffle(
  personToken: string,
  venueId: string,
  raffleId: number,
  data: RaffleUpdate
): Promise<RaffleRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<RaffleRow>(
    `/venues/${venueId}/raffles/${raffleId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deleteRaffle(personToken: string, venueId: string, raffleId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/raffles/${raffleId}`, { method: "DELETE" }, personToken)
}

export async function listRaffleEntries(personToken: string, venueId: string, raffleId: number): Promise<EntryRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EntryRow[]>(`/venues/${venueId}/raffles/${raffleId}/entries`, {}, personToken)
}

export async function creditTickets(
  personToken: string,
  venueId: string,
  raffleId: number,
  discordUserId: string,
  data: TicketCredit
): Promise<EntryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EntryRow>(
    `/venues/${venueId}/raffles/${raffleId}/entries/${discordUserId}`,
    { method: "PUT", body: JSON.stringify(data) },
    personToken
  )
}

export async function refundTickets(
  personToken: string,
  venueId: string,
  raffleId: number,
  discordUserId: string
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/raffles/${raffleId}/entries/${discordUserId}`,
    { method: "DELETE" },
    personToken
  )
}

export async function rollRaffle(personToken: string, venueId: string, raffleId: number): Promise<RaffleRoll> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<RaffleRoll>(`/venues/${venueId}/raffles/${raffleId}/roll`, { method: "POST" }, personToken)
}

// ── Payroll API ────────────────────────────────────────────────

export type PaymentType = "fixed_salary" | "hourly" | "pot_share"

export interface PayrollEntryRow {
  id: number
  membership_id: number | null
  person_id: number
  payment_type: PaymentType
  base_rate_minor: number
  minutes_worked: number | null
  bonus_amount_minor: number | null
  total_amount_minor: number
  period_start: string
  period_end: string
  is_paid: boolean
  paid_at: string | null
  paid_by_person_id: number | null
  pot_distribution_id: number | null
  notes: string | null
  created_at: string
}

export interface PayrollEntryCreate {
  membership_id: number
  payment_type: "fixed_salary" | "hourly"
  base_rate_minor: number
  minutes_worked?: number | null
  bonus_amount_minor?: number | null
  period_start: string
  period_end: string
  notes?: string | null
}

export interface PayrollEntryUpdate {
  is_paid?: boolean
  notes?: string | null
}

export async function listPayroll(
  personToken: string,
  venueId: string,
  opts: { from: string; to: string; isPaid?: boolean; membershipId?: number }
): Promise<PayrollEntryRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams({ from: opts.from, to: opts.to })
  if (opts.isPaid !== undefined) params.set("is_paid", String(opts.isPaid))
  if (opts.membershipId !== undefined) params.set("membership_id", String(opts.membershipId))
  return xvmFetch<PayrollEntryRow[]>(`/venues/${venueId}/finance/payroll?${params}`, {}, personToken)
}

// xvm-api rejects a from/to window over 60 days (400, "Windows are capped at
// 60 days"), same cap listShiftsChunked already works around. Callers wanting a
// wider range (the payroll page's 12-month default) chunk through this instead
// of listPayroll directly.
export async function listPayrollChunked(
  personToken: string,
  venueId: string,
  opts: { from: string; to: string; isPaid?: boolean; membershipId?: number }
): Promise<PayrollEntryRow[]> {
  const from = new Date(opts.from)
  const to = new Date(opts.to)
  const chunks: { from: string; to: string }[] = []
  let chunkStart = from
  while (chunkStart < to) {
    const chunkEnd = new Date(
      Math.min(chunkStart.getTime() + (LIST_SHIFTS_MAX_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000, to.getTime())
    )
    chunks.push({ from: chunkStart.toISOString(), to: chunkEnd.toISOString() })
    chunkStart = chunkEnd
  }
  const results = await Promise.all(
    chunks.map((c) => listPayroll(personToken, venueId, { ...opts, from: c.from, to: c.to }))
  )
  const byId = new Map<number, PayrollEntryRow>()
  for (const entry of results.flat()) byId.set(entry.id, entry)
  return [...byId.values()]
}

export async function createPayrollEntry(
  personToken: string,
  venueId: string,
  data: PayrollEntryCreate
): Promise<PayrollEntryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PayrollEntryRow>(
    `/venues/${venueId}/finance/payroll`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updatePayrollEntry(
  personToken: string,
  venueId: string,
  entryId: number,
  data: PayrollEntryUpdate
): Promise<PayrollEntryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PayrollEntryRow>(
    `/venues/${venueId}/finance/payroll/${entryId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deletePayrollEntry(personToken: string, venueId: string, entryId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/finance/payroll/${entryId}`, { method: "DELETE" }, personToken)
}

// ── Finance API ────────────────────────────────────────────────

export interface FinanceSettingsRow {
  tax_basis_points: number
  include_sales_in_pot: boolean
  default_tip_pooled: boolean
  auto_generate_payroll: boolean
  auto_close_after_hours: number | null
  payout_rounding_minor: number
}

export interface FinanceSettingsUpdate {
  tax_basis_points?: number
  include_sales_in_pot?: boolean
  default_tip_pooled?: boolean
  auto_generate_payroll?: boolean
  auto_close_after_hours?: number | null
  payout_rounding_minor?: number
}

export async function getFinanceSettings(personToken: string, venueId: string): Promise<FinanceSettingsRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<FinanceSettingsRow>(`/venues/${venueId}/finance/settings`, {}, personToken)
}

export async function updateFinanceSettings(
  personToken: string,
  venueId: string,
  data: FinanceSettingsUpdate
): Promise<FinanceSettingsRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<FinanceSettingsRow>(
    `/venues/${venueId}/finance/settings`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export type FinanceEntryType = "revenue" | "expense" | "payout"

export interface FinanceCategoryRow {
  id: number
  name: string
  sort_order: number
  applies_to: FinanceEntryType | null
}

export interface FinanceCategoryCreate {
  name: string
  sort_order?: number
  applies_to?: FinanceEntryType | null
}

export interface FinanceCategoryUpdate {
  name?: string
  sort_order?: number
  applies_to?: FinanceEntryType | null
}

export async function listFinanceCategories(personToken: string, venueId: string): Promise<FinanceCategoryRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<FinanceCategoryRow[]>(`/venues/${venueId}/finance/categories`, {}, personToken)
}

export async function createFinanceCategory(
  personToken: string,
  venueId: string,
  data: FinanceCategoryCreate
): Promise<FinanceCategoryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<FinanceCategoryRow>(
    `/venues/${venueId}/finance/categories`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updateFinanceCategory(
  personToken: string,
  venueId: string,
  categoryId: number,
  data: FinanceCategoryUpdate
): Promise<FinanceCategoryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<FinanceCategoryRow>(
    `/venues/${venueId}/finance/categories/${categoryId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deleteFinanceCategory(
  personToken: string,
  venueId: string,
  categoryId: number
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/finance/categories/${categoryId}`, { method: "DELETE" }, personToken)
}

// ── Finance: Transactions ────────────────────────────────────────

export type FinanceTransactionKind = "sale" | "tip" | "cover_charge" | "other_income" | "expense" | "payout"
export type FinanceTransactionStatus = "pending" | "posted"

export interface FinanceTransactionRow {
  id: number
  kind: FinanceTransactionKind
  entry_type: FinanceEntryType
  status: FinanceTransactionStatus
  amount: number
  category_id: number | null
  event_id: number | null
  service_id: number | null
  service_name: string | null
  membership_id: number | null
  recorded_by_person_id: number | null
  customer_name: string | null
  notes: string | null
  idempotency_key: string | null
  created_at: string
  posted_at: string | null
  posted_by_person_id: number | null
  voided_at: string | null
  voided_by_person_id: number | null
  void_reason: string | null
}

export interface FinanceTransactionCreate {
  kind?: FinanceTransactionKind
  amount: number
  status?: FinanceTransactionStatus
  category_id?: number | null
  event_id?: number | null
  service_id?: number | null
  membership_id?: number | null
  customer_name?: string | null
  notes?: string | null
  idempotency_key?: string | null
}

export interface FinanceTransactionUpdate {
  amount?: number
  category_id?: number | null
  event_id?: number | null
  service_id?: number | null
  membership_id?: number | null
  customer_name?: string | null
  notes?: string | null
}

export async function listFinanceTransactions(
  personToken: string,
  venueId: string,
  opts: { from: string; to: string; serviceId?: number }
): Promise<FinanceTransactionRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams({ from: opts.from, to: opts.to })
  if (opts.serviceId !== undefined) params.set("service_id", String(opts.serviceId))
  return xvmFetch<FinanceTransactionRow[]>(`/venues/${venueId}/finance/transactions?${params}`, {}, personToken)
}

export async function createFinanceTransaction(
  personToken: string,
  venueId: string,
  data: FinanceTransactionCreate
): Promise<FinanceTransactionRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<FinanceTransactionRow>(
    `/venues/${venueId}/finance/transactions`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updateFinanceTransaction(
  personToken: string,
  venueId: string,
  transactionId: number,
  data: FinanceTransactionUpdate
): Promise<FinanceTransactionRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<FinanceTransactionRow>(
    `/venues/${venueId}/finance/transactions/${transactionId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function voidFinanceTransaction(
  personToken: string,
  venueId: string,
  transactionId: number,
  data: { reason?: string | null }
): Promise<FinanceTransactionRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<FinanceTransactionRow>(
    `/venues/${venueId}/finance/transactions/${transactionId}/void`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

// ── Services: Categories ────────────────────────────────────────

export interface ServiceCategoryRow {
  id: number
  name: string
  sort_order: number
}

export interface ServiceCategoryCreate {
  name: string
  sort_order?: number
}

export interface ServiceCategoryUpdate {
  name?: string
  sort_order?: number
}

export async function listServiceCategories(personToken: string, venueId: string): Promise<ServiceCategoryRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ServiceCategoryRow[]>(`/venues/${venueId}/services/categories`, {}, personToken)
}

export async function createServiceCategory(
  personToken: string,
  venueId: string,
  data: ServiceCategoryCreate
): Promise<ServiceCategoryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ServiceCategoryRow>(
    `/venues/${venueId}/services/categories`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updateServiceCategory(
  personToken: string,
  venueId: string,
  categoryId: number,
  data: ServiceCategoryUpdate
): Promise<ServiceCategoryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ServiceCategoryRow>(
    `/venues/${venueId}/services/categories/${categoryId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deleteServiceCategory(personToken: string, venueId: string, categoryId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/services/categories/${categoryId}`, { method: "DELETE" }, personToken)
}

// ── Services ───────────────────────────────────────────────────

export interface ServiceInventoryRow {
  service_id: number
  linked_item_id: number
  linked_item_name: string | null
  linked_item_icon: number | null
  stock_count: number | null
  low_stock_threshold: number | null
  is_low: boolean
  updated_at: string
}

export interface ServiceRow {
  id: number
  name: string
  description: string | null
  price_minor: number | null
  category_id: number | null
  is_active: boolean
  sort_order: number
  position_ids: number[]
  inventory: ServiceInventoryRow | null
}

export interface ServiceCreate {
  name: string
  description?: string | null
  price_minor?: number | null
  category_id?: number | null
  is_active?: boolean
  sort_order?: number
}

export interface ServiceUpdate {
  name?: string
  description?: string | null
  price_minor?: number | null
  category_id?: number | null
  is_active?: boolean
  sort_order?: number
}

export async function listServices(personToken: string, venueId: string): Promise<ServiceRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ServiceRow[]>(`/venues/${venueId}/services`, {}, personToken)
}

export async function getService(personToken: string, venueId: string, serviceId: number): Promise<ServiceRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ServiceRow>(`/venues/${venueId}/services/${serviceId}`, {}, personToken)
}

export async function createService(
  personToken: string,
  venueId: string,
  data: ServiceCreate
): Promise<ServiceRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ServiceRow>(`/venues/${venueId}/services`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function updateService(
  personToken: string,
  venueId: string,
  serviceId: number,
  data: ServiceUpdate
): Promise<ServiceRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ServiceRow>(
    `/venues/${venueId}/services/${serviceId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deleteService(personToken: string, venueId: string, serviceId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/services/${serviceId}`, { method: "DELETE" }, personToken)
}

export async function grantServicePosition(
  personToken: string,
  venueId: string,
  serviceId: number,
  positionId: number
): Promise<ServiceRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ServiceRow>(
    `/venues/${venueId}/services/${serviceId}/positions`,
    { method: "POST", body: JSON.stringify({ position_id: positionId }) },
    personToken
  )
}

export async function revokeServicePosition(
  personToken: string,
  venueId: string,
  serviceId: number,
  positionId: number
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/services/${serviceId}/positions/${positionId}`,
    { method: "DELETE" },
    personToken
  )
}

// ── Services: Inventory ──────────────────────────────────────────

export interface InventoryLinkInput {
  linked_item_id: number
  linked_item_name?: string | null
  linked_item_icon?: number | null
  low_stock_threshold?: number | null
}

export type StockMovementReason = "restock" | "adjustment" | "spoilage"

export interface StockMovementCreateInput {
  reason: StockMovementReason
  delta: number
  note?: string | null
}

export interface StockMovementRow {
  id: number
  // "sale" is system-generated by the transaction flow when a posted sale consumes stock —
  // never submitted via createStockMovement, only ever seen when reading movement history.
  reason: StockMovementReason | "sale"
  delta: number
  transaction_id: number | null
  actor_person_id: number | null
  note: string | null
  created_at: string
}

export async function linkServiceInventory(
  personToken: string,
  venueId: string,
  serviceId: number,
  data: InventoryLinkInput
): Promise<ServiceInventoryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ServiceInventoryRow>(
    `/venues/${venueId}/services/${serviceId}/inventory`,
    { method: "PUT", body: JSON.stringify(data) },
    personToken
  )
}

export async function unlinkServiceInventory(personToken: string, venueId: string, serviceId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/services/${serviceId}/inventory`, { method: "DELETE" }, personToken)
}

export async function setStock(
  personToken: string,
  venueId: string,
  serviceId: number,
  data: { stock_count: number; note?: string | null }
): Promise<ServiceInventoryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ServiceInventoryRow>(
    `/venues/${venueId}/services/${serviceId}/inventory/stock`,
    { method: "PUT", body: JSON.stringify(data) },
    personToken
  )
}

export async function createStockMovement(
  personToken: string,
  venueId: string,
  serviceId: number,
  data: StockMovementCreateInput
): Promise<StockMovementRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<StockMovementRow>(
    `/venues/${venueId}/services/${serviceId}/inventory/movements`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function listStockMovements(
  personToken: string,
  venueId: string,
  serviceId: number,
  limit = 50
): Promise<StockMovementRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<StockMovementRow[]>(
    `/venues/${venueId}/services/${serviceId}/inventory/movements?limit=${limit}`,
    {},
    personToken
  )
}

