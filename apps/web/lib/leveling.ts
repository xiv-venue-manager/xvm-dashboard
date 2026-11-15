import { z } from "zod"
import { validators } from "@/lib/validation"
import type { LevelingSettings, LevelingSource } from "@/lib/api/xvm-api"

export const RULE_SOURCES = [
  "discord.message",
  "discord.voice",
  "patron.visit",
  "shift.completed",
  "transaction.logged",
  "event.attended",
] as const satisfies readonly LevelingSource[]

export type RuleSource = (typeof RULE_SOURCES)[number]

export const SOURCE_LABELS: Record<LevelingSource, string> = {
  "discord.message": "Sending a message",
  "discord.voice": "Time in voice",
  "patron.visit": "Visiting the venue",
  "shift.completed": "Completing a shift",
  "transaction.logged": "Logging a sale",
  "event.attended": "Attending an event",
  manual: "Awarded by hand",
}

export function sourceLabel(source: LevelingSource): string {
  return SOURCE_LABELS[source]
}

export function xpForLevel(level: number, curve: Pick<LevelingSettings, "curve_quadratic" | "curve_linear">): number {
  return curve.curve_quadratic * level * level + curve.curve_linear * level
}

export function formatCooldown(seconds: number): string {
  if (seconds <= 0) return "No cooldown"
  if (seconds % 3600 === 0) return `${seconds / 3600} h`
  if (seconds % 60 === 0) return `${seconds / 60} min`
  return `${seconds} s`
}

export const settingsBodySchema = z
  .object({
    xpName: z.string().trim().min(1).max(32).optional(),
    curveQuadratic: z.number().int().min(1).max(10000).optional(),
    curveLinear: z.number().int().min(0).max(10000).optional(),
    announcementChannelId: validators.snowflake.nullable().optional(),
    excludedChannelIds: z.array(validators.snowflake).max(100).optional(),
    excludedRoleIds: z.array(validators.snowflake).max(100).optional(),
    voiceNeedsCompany: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), { message: "Nothing to save" })

export const ruleCreateSchema = z.object({
  sourceKey: z.enum(RULE_SOURCES),
  xpAmount: z.number().int().min(0).max(1_000_000),
  cooldownSeconds: z.number().int().min(0).max(2_147_483_647).optional(),
  enabled: z.boolean().optional(),
})

export const ruleUpdateSchema = z
  .object({
    xpAmount: z.number().int().min(0).max(1_000_000).optional(),
    cooldownSeconds: z.number().int().min(0).max(2_147_483_647).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), { message: "Nothing to save" })

const tierFields = {
  name: z.string().trim().min(1).max(100),
  minLevel: z.number().int().min(0).max(2_147_483_647),
  color: z.number().int().min(0).max(0xffffff).nullable(),
  icon: z.string().trim().max(100).nullable(),
  discordRoleId: validators.snowflake.nullable(),
}

export const tierCreateSchema = z.object({
  ...tierFields,
  color: tierFields.color.optional(),
  icon: tierFields.icon.optional(),
  discordRoleId: tierFields.discordRoleId.optional(),
})

export const tierUpdateSchema = z
  .object(tierFields)
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), { message: "Nothing to save" })
