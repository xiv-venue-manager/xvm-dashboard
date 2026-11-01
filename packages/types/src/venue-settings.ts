/**
 * Venue Settings Type Definitions
 * Provides type safety for venue.settings JSON field
 */

/**
 * A single shift template defining one shift type for an event night.
 * startOffsetHours is relative to the Partake event start time.
 */
export interface ShiftTemplate {
  name: string // e.g. "Early Shift"
  startOffsetHours: number // 0 = same as event start
  durationHours: number // e.g. 4
  slots: number // max staff for this shift
}

/**
 * Shift bot configuration — controls Discord pre-event shift signup posts
 */
export interface ShiftBotSettings {
  enabled: boolean
  channelId: string // Discord channel ID to post embeds in
  daysBeforeEvent?: number // how many days before to post — undefined = 3
  templates: ShiftTemplate[] // empty = one shift matching full event duration
  thumbnailUrl?: string // custom embed thumbnail; falls back to guild icon
  cachedGuildIconUrl?: string // auto-fetched guild icon, refreshed on first post
}

/**
 * Task visibility settings
 * Controls what tasks staff members can see
 */
export type TaskVisibility = "all" | "assigned" | "assigned_unassigned"

/**
 * Sales visibility settings
 * Controls what sales data staff members can see
 */
export type SalesVisibility = "all" | "own" | "none"

/**
 * Revenue visibility settings
 * Controls what revenue data staff members can see
 */
export type RevenueVisibility = "all" | "hide" | "own"

/**
 * Event visibility settings
 * Controls which events are shown to different roles
 */
export type EventVisibility = "all" | "published"

/**
 * Complete venue settings object
 * Stored in Prisma venue.settings JSON field
 */
export interface VenueSettings {
  taskVisibility: TaskVisibility
  salesVisibility: SalesVisibility
  revenueVisibility: RevenueVisibility
  eventVisibility: EventVisibility
  /** Partake.gg team integration ID */
  partakeTeamId?: number | null
  /** Venue category */
  venueType?: string | null
  /** Venue profile extras not stored as DB fields */
  tagline?: string
  tags?: string[]
  isAdult?: boolean // 18+ venue
  /** Discord shift bot configuration */
  shiftBot?: ShiftBotSettings
}

/**
 * Type guard to check if value is valid VenueSettings
 */
export function isVenueSettings(value: unknown): value is VenueSettings {
  if (!value || typeof value !== "object") {
    return false
  }

  const settings = value as Partial<VenueSettings>

  // Check taskVisibility if present
  if (settings.taskVisibility !== undefined) {
    if (!["all", "assigned", "assigned_unassigned"].includes(settings.taskVisibility)) {
      return false
    }
  }

  // Check salesVisibility if present
  if (settings.salesVisibility !== undefined) {
    if (!["all", "own", "none"].includes(settings.salesVisibility)) {
      return false
    }
  }

  // Check revenueVisibility if present
  if (settings.revenueVisibility !== undefined) {
    if (!["all", "hide", "own"].includes(settings.revenueVisibility)) {
      return false
    }
  }

  // Check eventVisibility if present
  if (settings.eventVisibility !== undefined) {
    if (!["all", "published"].includes(settings.eventVisibility)) {
      return false
    }
  }

  return true
}

/**
 * Parse unknown JSON value to VenueSettings with fallback
 * Safe wrapper that handles invalid/null values
 */
export function parseVenueSettings(value: unknown): VenueSettings {
  if (isVenueSettings(value)) {
    return value
  }

  return getDefaultVenueSettings()
}

/**
 * Get default venue settings
 * Used when creating new venues
 */
export function getDefaultVenueSettings(): VenueSettings {
  return {
    taskVisibility: "all",
    salesVisibility: "all",
    revenueVisibility: "all",
    eventVisibility: "all",
  }
}
