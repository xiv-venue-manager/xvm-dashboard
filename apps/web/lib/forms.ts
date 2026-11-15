import { z } from "zod"
import { validators } from "@/lib/validation"
import type { FormQuestionRow, FormQuestionType } from "@/lib/api/xvm-api"

export const QUESTION_TYPES = ["short_text", "long_text", "single_select", "multi_select"] as const satisfies readonly FormQuestionType[]

export const QUESTION_TYPE_LABELS: Record<FormQuestionType, string> = {
  short_text: "Short answer",
  long_text: "Long answer",
  single_select: "Pick one",
  multi_select: "Pick several",
}

export const FORM_LIMITS = {
  questions: 20,
  options: 20,
  optionLength: 100,
  promptLength: 80,
} as const

export function isSelectType(type: FormQuestionType): boolean {
  return type === "single_select" || type === "multi_select"
}

/** One option per line; blank lines dropped, whitespace trimmed. */
export function parseOptions(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
}

export function optionsProblem(options: string[]): string | null {
  if (options.length === 0) return "A pick question needs at least one option."
  if (options.length > FORM_LIMITS.options) return `A question takes at most ${FORM_LIMITS.options} options.`
  if (options.some((option) => option.length > FORM_LIMITS.optionLength)) {
    return `Each option is at most ${FORM_LIMITS.optionLength} characters.`
  }
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) return "Options must be different from each other."
  return null
}

export function orderedQuestions(questions: FormQuestionRow[]): FormQuestionRow[] {
  return [...questions].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
}

export interface Answer {
  questionId: number | null
  question: string
  answer: string[]
}

/** A stored answer is untyped JSON. A multi-select answer is a list, everything else one string. */
export function readAnswers(raw: Array<Record<string, unknown>>): Answer[] {
  return raw.map((entry) => {
    const answer = entry.answer
    return {
      questionId: typeof entry.question_id === "number" ? entry.question_id : null,
      question: typeof entry.question === "string" ? entry.question : "",
      answer: Array.isArray(answer) ? answer.map(String) : typeof answer === "string" && answer !== "" ? [answer] : [],
    }
  })
}

/** Answers in the order the form asks its questions; an answer to a deleted question goes last. */
export function answersInQuestionOrder(answers: Answer[], questions: FormQuestionRow[]): Answer[] {
  const rank = new Map(orderedQuestions(questions).map((question, index) => [question.id, index]))
  const at = (answer: Answer) => (answer.questionId !== null ? (rank.get(answer.questionId) ?? Infinity) : Infinity)
  return [...answers].sort((a, b) => at(a) - at(b))
}

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()

export const formCreateSchema = z.object({ name: z.string().trim().min(1).max(100) })

export const formUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: nullableText(2000),
    prePrompt: nullableText(2000),
    postPrompt: nullableText(2000),
    color: z.number().int().min(0).max(0xffffff).nullable(),
    buttonLabel: z.string().trim().min(1).max(80),
    buttonEmoji: nullableText(100),
    allowMultipleResponses: z.boolean(),
    responseChannelId: validators.snowflake.nullable(),
  })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), { message: "Nothing to save" })

export const questionCreateSchema = z.object({
  prompt: z.string().trim().min(1).max(FORM_LIMITS.promptLength),
  questionType: z.enum(QUESTION_TYPES).optional(),
  required: z.boolean().optional(),
})

export const questionUpdateSchema = z
  .object({
    prompt: z.string().trim().min(1).max(FORM_LIMITS.promptLength),
    questionType: z.enum(QUESTION_TYPES),
    required: z.boolean(),
    sortOrder: z.number().int().min(0).max(2_147_483_647),
    options: z.array(z.string().trim().min(1).max(FORM_LIMITS.optionLength)).max(FORM_LIMITS.options),
  })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), { message: "Nothing to save" })
  .refine((data) => data.options === undefined || new Set(data.options.map((o) => o.toLowerCase())).size === data.options.length, {
    message: "Options must be different from each other",
    path: ["options"],
  })

export const postSchema = z.object({ channelId: validators.snowflake })
