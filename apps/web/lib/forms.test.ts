import { describe, it, expect } from "vitest"
import {
  answersInQuestionOrder,
  formUpdateSchema,
  isSelectType,
  optionsProblem,
  orderedQuestions,
  parseOptions,
  questionCreateSchema,
  questionUpdateSchema,
  readAnswers,
} from "./forms"
import type { FormQuestionRow } from "@/lib/api/xvm-api"

const question = (id: number, sort_order: number): FormQuestionRow => ({
  id,
  prompt: `Q${id}`,
  question_type: "short_text",
  required: true,
  sort_order,
  options: [],
})

describe("parseOptions", () => {
  it("takes one option per line and drops blanks", () => {
    expect(parseOptions(" Yes \n\n No\n  \nMaybe ")).toEqual(["Yes", "No", "Maybe"])
    expect(parseOptions("")).toEqual([])
  })
})

describe("optionsProblem", () => {
  it("accepts a sensible list", () => {
    expect(optionsProblem(["Yes", "No"])).toBeNull()
  })

  it("refuses none, too many, too long and case-insensitive repeats", () => {
    expect(optionsProblem([])).not.toBeNull()
    expect(optionsProblem(Array.from({ length: 21 }, (_, i) => `o${i}`))).not.toBeNull()
    expect(optionsProblem(["x".repeat(101)])).not.toBeNull()
    expect(optionsProblem(["Yes", "yes"])).not.toBeNull()
  })
})

describe("isSelectType", () => {
  it("is true only for the two pick types", () => {
    expect(isSelectType("single_select")).toBe(true)
    expect(isSelectType("multi_select")).toBe(true)
    expect(isSelectType("short_text")).toBe(false)
    expect(isSelectType("long_text")).toBe(false)
  })
})

describe("orderedQuestions", () => {
  it("sorts by sort_order and breaks ties by id without touching the input", () => {
    const input = [question(3, 2), question(1, 5), question(2, 2)]
    expect(orderedQuestions(input).map((q) => q.id)).toEqual([2, 3, 1])
    expect(input.map((q) => q.id)).toEqual([3, 1, 2])
  })
})

describe("readAnswers", () => {
  it("reads strings, lists and missing answers", () => {
    expect(
      readAnswers([
        { question_id: 1, question: "Name?", answer: "Lily" },
        { question_id: 2, question: "Days?", answer: ["Mon", "Tue"] },
        { question_id: 3, question: "Notes?", answer: "" },
        { question: "Odd", answer: 5 },
      ])
    ).toEqual([
      { questionId: 1, question: "Name?", answer: ["Lily"] },
      { questionId: 2, question: "Days?", answer: ["Mon", "Tue"] },
      { questionId: 3, question: "Notes?", answer: [] },
      { questionId: null, question: "Odd", answer: [] },
    ])
  })
})

describe("answersInQuestionOrder", () => {
  it("follows the form's order and puts an answer to a deleted question last", () => {
    const answers = readAnswers([
      { question_id: 9, question: "Gone", answer: "x" },
      { question_id: 2, question: "Second", answer: "b" },
      { question_id: 1, question: "First", answer: "a" },
    ])
    const ordered = answersInQuestionOrder(answers, [question(1, 0), question(2, 1)])
    expect(ordered.map((a) => a.question)).toEqual(["First", "Second", "Gone"])
  })
})

describe("formUpdateSchema", () => {
  it("turns a blank text field into null so it clears", () => {
    expect(formUpdateSchema.parse({ description: "  " })).toEqual({ description: null })
    expect(formUpdateSchema.parse({ buttonEmoji: "" })).toEqual({ buttonEmoji: null })
  })

  it("keeps the button label non-empty and the colour in 24 bits", () => {
    expect(formUpdateSchema.safeParse({ buttonLabel: " " }).success).toBe(false)
    expect(formUpdateSchema.safeParse({ color: 0x1000000 }).success).toBe(false)
    expect(formUpdateSchema.safeParse({ color: null }).success).toBe(true)
  })

  it("needs something to save and a numeric response channel", () => {
    expect(formUpdateSchema.safeParse({}).success).toBe(false)
    expect(formUpdateSchema.safeParse({ responseChannelId: "abc" }).success).toBe(false)
    expect(formUpdateSchema.safeParse({ responseChannelId: null }).success).toBe(true)
  })
})

describe("question schemas", () => {
  it("caps a prompt at 80 characters", () => {
    expect(questionCreateSchema.safeParse({ prompt: "x".repeat(80) }).success).toBe(true)
    expect(questionCreateSchema.safeParse({ prompt: "x".repeat(81) }).success).toBe(false)
    expect(questionCreateSchema.safeParse({ prompt: "  " }).success).toBe(false)
  })

  it("refuses repeated options and an unknown type", () => {
    expect(questionUpdateSchema.safeParse({ options: ["A", "a"] }).success).toBe(false)
    expect(questionUpdateSchema.safeParse({ questionType: "number" }).success).toBe(false)
    expect(questionUpdateSchema.safeParse({ options: ["A", "B"], sortOrder: 0 }).success).toBe(true)
    expect(questionUpdateSchema.safeParse({}).success).toBe(false)
  })
})
