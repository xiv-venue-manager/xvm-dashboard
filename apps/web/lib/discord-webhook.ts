/**
 * Discord Webhook Utility
 * Sends formatted messages to Discord channels via webhooks
 */

/**
 * Sanitize user input before sending to Discord
 * Prevents webhook injection attacks by escaping special characters
 * and limiting string length
 */
function sanitizeForDiscord(input: string | null | undefined, maxLength: number = 1024): string {
  if (!input) return ""

  // Trim whitespace and limit length
  let sanitized = input.trim().slice(0, maxLength)

  // Escape Discord markdown characters that could be abused
  // This prevents formatting injection while preserving readability
  sanitized = sanitized
    .replace(/[@]/g, "@\u200B") // Zero-width space after @ to prevent mentions
    .replace(/[<>]/g, "") // Remove angle brackets to prevent custom emoji/channel injection

  return sanitized
}

/**
 * Sanitize a URL to ensure it's a valid Discord webhook URL
 */
function isValidDiscordWebhookUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === "https:" &&
      ["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"].includes(parsed.hostname) &&
      parsed.pathname.startsWith("/api/webhooks/")
    )
  } catch {
    return false
  }
}

export interface DiscordEmbed {
  title?: string
  description?: string
  color?: number
  url?: string
  fields?: Array<{
    name: string
    value: string
    inline?: boolean
  }>
  image?: { url: string }
  thumbnail?: { url: string }
  timestamp?: string
}

export interface DiscordWebhookPayload {
  content?: string
  embeds?: DiscordEmbed[]
  username?: string
  avatar_url?: string
}

export type WebhookType =
  "taskCreated" | "taskCompleted" | "partakeEvent" | "saleLogged" | "dailySalesSummary" | "staffJoined"

type WebhookGroup = "staff" | "events" | "revenue"

// Map webhook types to their groups
const WEBHOOK_TYPE_TO_GROUP: Record<WebhookType, WebhookGroup> = {
  taskCreated: "staff",
  taskCompleted: "staff",
  staffJoined: "staff",
  partakeEvent: "events",
  saleLogged: "revenue",
  dailySalesSummary: "revenue",
}

export interface VenueWebhookConfig {
  discordWebhooks?: {
    staff?: string
    events?: string
    revenue?: string
  }
  webhooks?: {
    [K in WebhookType]?: boolean
  }
  // Backward compatibility
  discordWebhookUrl?: string | null
}

/**
 * Get the webhook URL for a specific notification type
 */
export function getWebhookUrlForType(config: VenueWebhookConfig, webhookType: WebhookType): string | null {
  // Check if this webhook type is enabled
  if (config.webhooks && config.webhooks[webhookType] === false) {
    return null
  }

  // Get the webhook group for this type
  const group = WEBHOOK_TYPE_TO_GROUP[webhookType]

  // Try to get grouped webhook URL
  if (config.discordWebhooks && config.discordWebhooks[group]) {
    return config.discordWebhooks[group] || null
  }

  // Fallback to legacy single webhook URL
  return config.discordWebhookUrl || null
}

/**
 * Send a message to Discord via webhook
 */
export async function sendDiscordWebhook(webhookUrl: string | null, payload: DiscordWebhookPayload): Promise<boolean> {
  if (!webhookUrl) {
    console.warn("Discord webhook URL not provided")
    return false
  }

  // Validate webhook URL to prevent SSRF attacks
  if (!isValidDiscordWebhookUrl(webhookUrl)) {
    console.error("Invalid Discord webhook URL - must be a valid discord.com/api/webhooks URL")
    return false
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error("Discord webhook failed:", response.status, response.statusText)
      return false
    }

    return true
  } catch (error) {
    console.error("Error sending Discord webhook:", error)
    return false
  }
}

/**
 * Edit an existing Discord webhook message via PATCH.
 * Returns true on success.
 */
export async function editDiscordMessage(
  webhookUrl: string | null,
  messageId: string,
  payload: DiscordWebhookPayload
): Promise<boolean> {
  if (!webhookUrl || !isValidDiscordWebhookUrl(webhookUrl)) return false
  try {
    const res = await fetch(`${webhookUrl}/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.error("Discord webhook PATCH failed:", res.status, res.statusText)
      return false
    }
    return true
  } catch (error) {
    console.error("Error patching Discord webhook message:", error)
    return false
  }
}

/**
 * Send a webhook with `wait=true` so Discord returns the created message.
 * Returns the created message ID for later PATCH/DELETE, or null on failure.
 */
export async function sendDiscordWebhookWithMessageId(
  webhookUrl: string | null,
  payload: DiscordWebhookPayload
): Promise<string | null> {
  if (!webhookUrl || !isValidDiscordWebhookUrl(webhookUrl)) return null
  try {
    const url = new URL(webhookUrl)
    url.searchParams.set("wait", "true")
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.error("Discord webhook POST failed:", res.status, res.statusText)
      return null
    }
    const json = (await res.json()) as { id?: string }
    return json.id ?? null
  } catch (error) {
    console.error("Error sending Discord webhook:", error)
    return null
  }
}

/**
 * Discord color palette
 */
export const DiscordColors = {
  // Brand colors
  Blurple: 0x5865f2,
  Green: 0x57f287,
  Yellow: 0xfee75c,
  Fuchsia: 0xeb459e,
  Red: 0xed4245,

  // Status colors
  Success: 0x43b581,
  Warning: 0xfaa61a,
  Error: 0xf04747,
  Info: 0x3498db,

  // Task priorities
  Urgent: 0xed4245,
  High: 0xfaa61a,
  Medium: 0x3498db,
  Low: 0x95a5a6,
}

/**
 * Format a task notification
 */
export function formatTaskCreatedEmbed(task: {
  title: string
  description?: string | null
  priority: string
  dueDate?: Date | null
  assignee?: { name: string | null } | null
}): DiscordEmbed {
  const priorityColors: Record<string, number> = {
    URGENT: DiscordColors.Urgent,
    HIGH: DiscordColors.High,
    MEDIUM: DiscordColors.Medium,
    LOW: DiscordColors.Low,
  }

  // Sanitize user inputs
  const safeTitle = sanitizeForDiscord(task.title, 256)
  const safeDescription = sanitizeForDiscord(task.description, 1024)
  const safeAssigneeName = sanitizeForDiscord(task.assignee?.name, 256)

  const fields = []

  if (task.assignee) {
    fields.push({
      name: "Assigned To",
      value: safeAssigneeName || "Unknown",
      inline: true,
    })
  }

  fields.push({
    name: "Priority",
    value: task.priority,
    inline: true,
  })

  if (task.dueDate) {
    fields.push({
      name: "Due Date",
      value: `<t:${Math.floor(new Date(task.dueDate).getTime() / 1000)}:F>`,
      inline: true,
    })
  }

  return {
    title: "📋 New Task Created",
    description: `**${safeTitle}**${safeDescription ? `\n${safeDescription}` : ""}`,
    color: priorityColors[task.priority] || DiscordColors.Info,
    fields,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format a task completion notification
 */
export function formatTaskCompletedEmbed(task: {
  title: string
  priority: string
  completer?: { name: string | null } | null
}): DiscordEmbed {
  // Sanitize user inputs
  const safeTitle = sanitizeForDiscord(task.title, 256)
  const safeCompleterName = sanitizeForDiscord(task.completer?.name, 256)

  const fields = []

  if (task.completer) {
    fields.push({
      name: "Completed By",
      value: safeCompleterName || "Unknown",
      inline: true,
    })
  }

  return {
    title: "✅ Task Completed",
    description: `**${safeTitle}**`,
    color: DiscordColors.Success,
    fields,
    timestamp: new Date().toISOString(),
  }
}

export function extractPartakeImages(description: string | null | undefined): string[] {
  if (!description) return []
  const re = /!\[[^\]]*\]\(([^)]+)\)/g
  const urls: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(description)) !== null) {
    const url = m[1].trim()
    if (/^https?:\/\//i.test(url)) urls.push(url)
  }
  return urls.slice(0, 10)
}

export function extractPartakeTextBody(description: string | null | undefined): string {
  if (!description) return ""
  return description
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .split("\n")
    .map((l) =>
      l
        .trim()
        .replace(/^#{1,6}\s*/, "")
        .replace(/\*\*\*\*/g, "")
        .trim()
    )
    .filter((l) => l.length > 0 && !/^\*+$/.test(l))
    .join("\n")
    .trim()
}

export function formatPartakeEventPayload(event: {
  partakeEventId: number
  title: string
  description?: string | null
  location?: string | null
  startTime: Date
  endTime: Date
  partakeAttendeeCount?: number | null
  cancelled?: boolean
}): DiscordWebhookPayload {
  const partakeUrl = `https://www.partake.gg/events/${event.partakeEventId}`
  const safeTitle = sanitizeForDiscord(event.title, 240)
  const safeLocation = sanitizeForDiscord(event.location, 256)
  const textBody = sanitizeForDiscord(extractPartakeTextBody(event.description), 3800)
  const images = extractPartakeImages(event.description)

  const startUnix = Math.floor(event.startTime.getTime() / 1000)
  const endUnix = Math.floor(event.endTime.getTime() / 1000)
  const timeLine = `<t:${startUnix}:F> → <t:${endUnix}:t> (<t:${startUnix}:R>)`

  const titleDisplay = event.cancelled ? `❌ ~~${safeTitle}~~ (CANCELLED)` : safeTitle
  const color = event.cancelled ? DiscordColors.Red : DiscordColors.Blurple

  const headerParts = [`**📅 ${timeLine}**`]
  if (safeLocation) headerParts.push(`📍 ${safeLocation}`)
  if (textBody) headerParts.push(textBody)
  if (typeof event.partakeAttendeeCount === "number" && event.partakeAttendeeCount > 0) {
    headerParts.push(`👥 ${event.partakeAttendeeCount} attending on Partake`)
  }
  headerParts.push(`[View on Partake →](${partakeUrl})`)

  const headerEmbed: DiscordEmbed = {
    title: titleDisplay,
    url: partakeUrl,
    description: headerParts.join("\n\n"),
    color,
    timestamp: new Date().toISOString(),
  }

  const embeds: DiscordEmbed[] = [headerEmbed]

  if (images.length > 0) {
    headerEmbed.image = { url: images[0] }
    for (let i = 1; i < images.length; i++) {
      embeds.push({ url: partakeUrl, image: { url: images[i] } })
    }
  }

  return { embeds }
}

export function formatPartakeEventReminderPayload(event: {
  partakeEventId: number
  title: string
  description?: string | null
  location?: string | null
  startTime: Date
  endTime: Date
}): DiscordWebhookPayload {
  const partakeUrl = `https://www.partake.gg/events/${event.partakeEventId}`
  const safeTitle = sanitizeForDiscord(event.title, 240)
  const safeLocation = sanitizeForDiscord(event.location, 256)
  const startUnix = Math.floor(event.startTime.getTime() / 1000)
  const endUnix = Math.floor(event.endTime.getTime() / 1000)
  const images = extractPartakeImages(event.description)

  const parts = [`**📅 <t:${startUnix}:F> → <t:${endUnix}:t> (<t:${startUnix}:R>)**`]
  if (safeLocation) parts.push(`📍 ${safeLocation}`)
  parts.push(`[View on Partake →](${partakeUrl})`)

  const embed: DiscordEmbed = {
    title: `⏰ Tomorrow: ${safeTitle}`,
    url: partakeUrl,
    description: parts.join("\n\n"),
    color: DiscordColors.Warning,
    timestamp: new Date().toISOString(),
  }
  if (images.length > 0) {
    embed.thumbnail = { url: images[0] }
  }

  return { embeds: [embed] }
}

export function hashPartakeEventContent(event: {
  title: string
  description?: string | null
  location?: string | null
  startTime: Date
  endTime: Date
  partakeAttendeeCount?: number | null
}): string {
  const payload = [
    event.title,
    event.description ?? "",
    event.location ?? "",
    event.startTime.toISOString(),
    event.endTime.toISOString(),
    String(event.partakeAttendeeCount ?? 0),
  ].join("|")
  let h = 0
  for (let i = 0; i < payload.length; i++) {
    h = (h * 31 + payload.charCodeAt(i)) | 0
  }
  return h.toString(36)
}

/**
 * Format a sale logged notification
 */
export function formatSaleLoggedEmbed(transaction: {
  amount: number
  service?: { name: string } | null
  customerName?: string | null
  staff?: { name: string | null } | null
}): DiscordEmbed {
  // Sanitize user inputs
  const safeServiceName = sanitizeForDiscord(transaction.service?.name, 256)
  const safeCustomerName = sanitizeForDiscord(transaction.customerName, 256)
  const safeStaffName = sanitizeForDiscord(transaction.staff?.name, 256)

  const fields = []

  if (transaction.service) {
    fields.push({
      name: "Service",
      value: safeServiceName || "Unknown",
      inline: true,
    })
  }

  if (transaction.customerName) {
    fields.push({
      name: "Customer",
      value: safeCustomerName,
      inline: true,
    })
  }

  if (transaction.staff) {
    fields.push({
      name: "Logged By",
      value: safeStaffName || "Unknown",
      inline: true,
    })
  }

  return {
    title: "💰 Sale Logged",
    description: `**Amount: ${transaction.amount.toLocaleString("en-US")} Gil**`,
    color: DiscordColors.Green,
    fields,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format a daily sales summary notification
 */
export function formatDailySalesSummaryEmbed(summary: {
  date: string
  totalSales: number
  totalRevenue: number
  topService?: { name: string; sales: number } | null
}): DiscordEmbed {
  // Sanitize user inputs
  const safeTopServiceName = sanitizeForDiscord(summary.topService?.name, 256)

  const fields = [
    {
      name: "Total Sales",
      value: `${summary.totalSales} transactions`,
      inline: true,
    },
    {
      name: "Total Revenue",
      value: `${summary.totalRevenue.toLocaleString("en-US")} Gil`,
      inline: true,
    },
  ]

  if (summary.topService) {
    fields.push({
      name: "Top Service",
      value: `${safeTopServiceName} (${summary.topService.sales} sales)`,
      inline: false,
    })
  }

  return {
    title: "📊 Daily Sales Summary",
    description: `Sales report for **${summary.date}**`,
    color: DiscordColors.Info,
    fields,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format a staff joined notification
 */
export function formatStaffJoinedEmbed(staff: { name: string | null; role: string }): DiscordEmbed {
  // Sanitize user inputs
  const safeName = sanitizeForDiscord(staff.name, 256)

  return {
    title: "👥 New Staff Member Joined",
    description: `**${safeName || "Unknown"}** has joined the venue as **${staff.role}**`,
    color: DiscordColors.Success,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format an app-level feedback notification (sent to the admin channel,
 * not per-venue). Triggered when a user submits via POST /api/feedback.
 */
export function formatFeedbackSubmittedEmbed(feedback: {
  category: string
  subject: string
  description: string
  url?: string | null
  user: { name?: string | null; displayName?: string | null; email?: string | null }
}): DiscordEmbed {
  const safeSubject = sanitizeForDiscord(feedback.subject, 256)
  const safeDescription = sanitizeForDiscord(feedback.description, 1024)
  const safeUserName = sanitizeForDiscord(
    feedback.user.displayName || feedback.user.name || feedback.user.email || "Unknown",
    256
  )
  const safeUrl = sanitizeForDiscord(feedback.url, 512)

  const colorByCategory: Record<string, number> = {
    BUG_REPORT: DiscordColors.Red,
    FEATURE_REQUEST: DiscordColors.Blurple,
    IMPROVEMENT: DiscordColors.Info,
    GENERAL: DiscordColors.Yellow,
  }

  const iconByCategory: Record<string, string> = {
    BUG_REPORT: "🐛",
    FEATURE_REQUEST: "💡",
    IMPROVEMENT: "✨",
    GENERAL: "💬",
  }

  const fields = [
    { name: "From", value: safeUserName, inline: true },
    { name: "Category", value: feedback.category, inline: true },
  ]

  if (safeUrl) {
    fields.push({ name: "Page", value: safeUrl, inline: false })
  }

  fields.push({ name: "Details", value: safeDescription || "(no description)", inline: false })

  return {
    title: `${iconByCategory[feedback.category] ?? "💬"} New Feedback: ${safeSubject || "(no subject)"}`,
    description: "A user submitted feedback on xivvenuemanager.com",
    color: colorByCategory[feedback.category] ?? DiscordColors.Info,
    fields,
    timestamp: new Date().toISOString(),
  }
}
