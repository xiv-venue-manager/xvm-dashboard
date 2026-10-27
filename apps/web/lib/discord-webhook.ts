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
