import { z } from "zod"

// Mirrors xvm-api's TemplateCreate/TemplateUpdate and their option schemas, so a
// bad field is a 400 here rather than a 422 from xvm-api. Lengths and the option
// cap come from api/constants.py - keep them in step.
export const MAX_TEMPLATE_OPTIONS = 20

const MAX_DISCORD_COLOR = 0xffffff

export const templateOptionCreateSchema = z.object({
  name: z.string().trim().min(1, "Role name is required").max(100, "Role name too long (max 100 characters)"),
  color: z.number().int().min(0).max(MAX_DISCORD_COLOR),
  emoji: z.string().trim().min(1).max(100).nullish(),
})

export const templateOptionUpdateSchema = templateOptionCreateSchema.partial()

export const templateCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long (max 100 characters)"),
  title: z.string().trim().min(1, "Title is required").max(100, "Title too long (max 100 characters)"),
  description: z.string().trim().max(2000, "Description too long (max 2000 characters)").nullish(),
  message_type: z.enum(["normal", "unique", "verify"]).optional(),
  options: z.array(templateOptionCreateSchema).max(MAX_TEMPLATE_OPTIONS).optional(),
})

export const templateUpdateSchema = templateCreateSchema.omit({ options: true }).partial()
