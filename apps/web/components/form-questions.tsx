"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import {
  FORM_LIMITS,
  isSelectType,
  optionsProblem,
  orderedQuestions,
  parseOptions,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
} from "@/lib/forms"
import type { FormQuestionRow, FormQuestionType } from "@/lib/api/xvm-api"

export interface FormQuestionsProps {
  venueId: string
  formId: number
  questions: FormQuestionRow[]
  onChange: (questions: FormQuestionRow[]) => void
}

const QUESTION_PATH = "/api/venues/[venueId]/forms/[formId]/questions/[questionId]"

function QuestionFields({
  idPrefix,
  prompt,
  setPrompt,
  type,
  setType,
  required,
  setRequired,
  optionsText,
  setOptionsText,
  disabled,
}: {
  idPrefix: string
  prompt: string
  setPrompt: (value: string) => void
  type: FormQuestionType
  setType: (value: FormQuestionType) => void
  required: boolean
  setRequired: (value: boolean) => void
  optionsText: string
  setOptionsText: (value: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-prompt`}>Question</Label>
        <Input
          id={`${idPrefix}-prompt`}
          value={prompt}
          maxLength={FORM_LIMITS.promptLength}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-type`}>Answer type</Label>
          <Select value={type} onValueChange={(value) => setType(value as FormQuestionType)} disabled={disabled}>
            <SelectTrigger id={`${idPrefix}-type`} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUESTION_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {QUESTION_TYPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          <Switch id={`${idPrefix}-required`} checked={required} onCheckedChange={setRequired} disabled={disabled} />
          <Label htmlFor={`${idPrefix}-required`}>Required</Label>
        </div>
      </div>
      {isSelectType(type) && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-options`}>Options, one per line</Label>
          <Textarea
            id={`${idPrefix}-options`}
            rows={4}
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            Up to {FORM_LIMITS.options} options, each up to {FORM_LIMITS.optionLength} characters.
          </p>
        </div>
      )}
    </div>
  )
}

function QuestionItem({
  venueId,
  formId,
  question,
  position,
  count,
  busy,
  onSaved,
  onDelete,
  onMove,
}: {
  venueId: string
  formId: number
  question: FormQuestionRow
  position: number
  count: number
  busy: boolean
  onSaved: (question: FormQuestionRow) => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const [editing, setEditing] = useState(false)
  const [prompt, setPrompt] = useState(question.prompt)
  const [type, setType] = useState(question.question_type)
  const [required, setRequired] = useState(question.required)
  const [optionsText, setOptionsText] = useState(question.options.join("\n"))
  const [saving, setSaving] = useState(false)

  async function save() {
    if (prompt.trim() === "") {
      toast.error("A question needs some text.")
      return
    }
    const options = parseOptions(optionsText)
    const sendOptions = isSelectType(type)
    if (sendOptions) {
      const problem = optionsProblem(options)
      if (problem) {
        toast.error(problem)
        return
      }
    }
    setSaving(true)
    try {
      const saved = await apiRoute<FormQuestionRow>(QUESTION_PATH, {
        params: { venueId, formId, questionId: question.id },
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          questionType: type,
          required,
          ...(sendOptions && { options }),
        }),
      })
      onSaved(saved)
      setEditing(false)
      toast.success("Question saved.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save the question.")
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <Card>
        <CardContent className="space-y-4 p-5">
          <QuestionFields
            idPrefix={`q-${question.id}`}
            prompt={prompt}
            setPrompt={setPrompt}
            type={type}
            setType={setType}
            required={required}
            setRequired={setRequired}
            optionsText={optionsText}
            setOptionsText={setOptionsText}
            disabled={saving}
          />
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save question"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-[10rem] flex-1">
          <p className="font-semibold">
            {position + 1}. {question.prompt}
          </p>
          <p className="text-xs text-muted-foreground">
            {QUESTION_TYPE_LABELS[question.question_type]}
            {question.required ? ", required" : ", optional"}
            {isSelectType(question.question_type) ? `, ${question.options.length} options` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" aria-label="Move up" disabled={busy || position === 0} onClick={() => onMove(-1)}>
            &uarr;
          </Button>
          <Button size="sm" variant="outline" aria-label="Move down" disabled={busy || position === count - 1} onClick={() => onMove(1)}>
            &darr;
          </Button>
          <Button size="sm" variant="outline-blue" onClick={() => setEditing(true)} disabled={busy}>
            Edit
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete} disabled={busy}>
            Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function FormQuestions({ venueId, formId, questions, onChange }: FormQuestionsProps) {
  const ordered = orderedQuestions(questions)
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [type, setType] = useState<FormQuestionType>("short_text")
  const [required, setRequired] = useState(true)
  const [optionsText, setOptionsText] = useState("")

  const replace = (saved: FormQuestionRow) => onChange(questions.map((q) => (q.id === saved.id ? saved : q)))

  async function add() {
    if (prompt.trim() === "") {
      toast.error("A question needs some text.")
      return
    }
    const options = parseOptions(optionsText)
    if (isSelectType(type)) {
      const problem = optionsProblem(options)
      if (problem) {
        toast.error(problem)
        return
      }
    }
    setBusy(true)
    try {
      let created = await apiRoute<FormQuestionRow>("/api/venues/[venueId]/forms/[formId]/questions", {
        params: { venueId, formId },
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), questionType: type, required }),
      })
      onChange([...questions, created])
      if (isSelectType(type)) {
        try {
          created = await apiRoute<FormQuestionRow>(QUESTION_PATH, {
            params: { venueId, formId, questionId: created.id },
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ options }),
          })
          onChange([...questions, created])
        } catch (e) {
          toast.error(
            `The question was added, but its options were not saved: ${e instanceof ApiError ? e.message : "try editing it."}`
          )
          return
        }
      }
      setPrompt("")
      setOptionsText("")
      toast.success("Question added.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to add the question.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(question: FormQuestionRow) {
    setBusy(true)
    try {
      await apiRoute(QUESTION_PATH, { params: { venueId, formId, questionId: question.id }, method: "DELETE" })
      onChange(questions.filter((q) => q.id !== question.id))
      toast.success("Question removed.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove the question.")
    } finally {
      setBusy(false)
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const a = ordered[index]
    const b = ordered[index + direction]
    if (!a || !b) return
    const orderOf = (row: FormQuestionRow, to: number) =>
      apiRoute<FormQuestionRow>(QUESTION_PATH, {
        params: { venueId, formId, questionId: row.id },
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: to }),
      })
    setBusy(true)
    try {
      const savedA = await orderOf(a, b.sort_order)
      const savedB = await orderOf(b, a.sort_order)
      onChange(questions.map((q) => (q.id === savedA.id ? savedA : q.id === savedB.id ? savedB : q)))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to reorder the questions.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {ordered.length} of {FORM_LIMITS.questions} questions. Members answer them in this order.
      </p>

      {ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      ) : (
        <div className="space-y-3">
          {ordered.map((question, index) => (
            <QuestionItem
              key={question.id}
              venueId={venueId}
              formId={formId}
              question={question}
              position={index}
              count={ordered.length}
              busy={busy}
              onSaved={replace}
              onDelete={() => remove(question)}
              onMove={(direction) => move(index, direction)}
            />
          ))}
        </div>
      )}

      {ordered.length < FORM_LIMITS.questions && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <p className="font-semibold">New question</p>
            <QuestionFields
              idPrefix="q-new"
              prompt={prompt}
              setPrompt={setPrompt}
              type={type}
              setType={setType}
              required={required}
              setRequired={setRequired}
              optionsText={optionsText}
              setOptionsText={setOptionsText}
              disabled={busy}
            />
            <Button onClick={add} disabled={busy}>
              {busy ? "Adding..." : "Add question"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
