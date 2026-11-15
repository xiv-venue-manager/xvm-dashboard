import { z } from "zod"
import { validators } from "@/lib/validation"
import type { PerkRepeatability, VipRow } from "@/lib/api/xvm-api"

export const REPEATABILITIES = ["once", "weekly", "monthly", "unlimited"] as const satisfies readonly PerkRepeatability[]

export const REPEATABILITY_LABELS: Record<PerkRepeatability, string> = {
  once: "Once per membership",
  weekly: "Weekly",
  monthly: "Monthly",
  unlimited: "Unlimited",
}

export const VIP_POST_KINDS = ["roster", "perks"] as const

export const VIP_POST_LABELS: Record<(typeof VIP_POST_KINDS)[number], string> = {
  roster: "VIP roster",
  perks: "Perks catalogue",
}

const DAY_MS = 86_400_000

/** What a VIP row says about how long it has left. An ended VIP says so; no expiry means lifetime. */
export function vipTimeLeft(vip: Pick<VipRow, "ended_at" | "expires_at" | "is_active">, now: Date): string {
  if (vip.ended_at !== null) return "Ended"
  if (vip.expires_at === null) return "Lifetime"
  const left = new Date(vip.expires_at).getTime() - now.getTime()
  if (!Number.isFinite(left)) return "Lifetime"
  if (left <= 0) return "Expired"
  const days = Math.ceil(left / DAY_MS)
  return days === 1 ? "Expires in 1 day" : `Expires in ${days} days`
}

/** A date input's yyyy-mm-dd as the end of that day in the browser's timezone, as an ISO string. */
export function endOfDayIso(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const at = new Date(`${day}T23:59:59`)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/** The yyyy-mm-dd of an expiry in the browser's timezone, for a date input. */
export function isoToDay(iso: string | null): string {
  if (iso === null) return ""
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ""
  const month = String(at.getMonth() + 1).padStart(2, "0")
  const day = String(at.getDate()).padStart(2, "0")
  return `${at.getFullYear()}-${month}-${day}`
}

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()

const expiry = z.string().datetime({ offset: true }).nullable()

export const tierCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: nullableText(250).optional(),
  cost: z.number().int().min(0).max(999_999_999_999).optional(),
  color: z.number().int().min(0).max(0xffffff).nullable().optional(),
  discordRoleId: validators.snowflake.nullable().optional(),
  sortOrder: z.number().int().min(0).max(2_147_483_647).optional(),
})

export const tierUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: nullableText(250),
    cost: z.number().int().min(0).max(999_999_999_999),
    color: z.number().int().min(0).max(0xffffff).nullable(),
    discordRoleId: validators.snowflake.nullable(),
    sortOrder: z.number().int().min(0).max(2_147_483_647),
  })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), { message: "Nothing to save" })

export const perkCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: nullableText(250).optional(),
  repeatability: z.enum(REPEATABILITIES).optional(),
  sortOrder: z.number().int().min(0).max(2_147_483_647).optional(),
})

export const perkUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: nullableText(250),
    repeatability: z.enum(REPEATABILITIES),
    sortOrder: z.number().int().min(0).max(2_147_483_647),
  })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), { message: "Nothing to save" })

export const grantSchema = z.object({
  discordUserId: validators.snowflake,
  displayName: z.string().trim().min(1).max(100),
  tierId: z.number().int().min(1).max(2_147_483_647),
  expiresAt: expiry.optional(),
  notes: nullableText(500).optional(),
})

export const vipUpdateSchema = z
  .object({ expiresAt: expiry, notes: nullableText(500) })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), { message: "Nothing to save" })

export const reassignSchema = z.object({ tierId: z.number().int().min(1).max(2_147_483_647) })

export const redeemSchema = z.object({
  perkId: z.number().int().min(1).max(2_147_483_647),
  note: nullableText(200).optional(),
})

export const settingsSchema = z.object({ warningDays: z.number().int().min(1).max(10).nullable() })

export const postCreateSchema = z.object({ kind: z.enum(VIP_POST_KINDS), channelId: validators.snowflake })
