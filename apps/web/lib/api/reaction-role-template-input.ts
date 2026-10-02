import { z } from "zod"

import {
  MAX_DISCORD_COLOR,
  MAX_TEMPLATE_DESCRIPTION,
  MAX_TEMPLATE_EMOJI,
  MAX_TEMPLATE_NAME,
  MAX_TEMPLATE_OPTIONS,
  MAX_TEMPLATE_ROLE_NAME,
  MAX_TEMPLATE_TITLE,
} from "@/lib/api/reaction-role-template-limits"

// Mirrors xvm-api's TemplateCreate/TemplateUpdate and their option schemas, so a
// bad field is a 400 here rather than a 422 from xvm-api.
export const templateOptionCreateSchema = z.object({
  name: z.string().trim().min(1, "Role name is required").max(MAX_TEMPLATE_ROLE_NAME, "Role name too long"),
  color: z.number().int().min(0).max(MAX_DISCORD_COLOR),
  emoji: z.string().trim().min(1).max(MAX_TEMPLATE_EMOJI).nullish(),
})

export const templateOptionUpdateSchema = templateOptionCreateSchema.partial()

export const templateCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(MAX_TEMPLATE_NAME, "Name too long"),
  title: z.string().trim().min(1, "Title is required").max(MAX_TEMPLATE_TITLE, "Title too long"),
  description: z.string().trim().max(MAX_TEMPLATE_DESCRIPTION, "Description too long").nullish(),
  message_type: z.enum(["normal", "unique", "verify"]).optional(),
  options: z.array(templateOptionCreateSchema).max(MAX_TEMPLATE_OPTIONS).optional(),
})

export const templateUpdateSchema = templateCreateSchema.omit({ options: true }).partial()
