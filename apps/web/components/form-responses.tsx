"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MemberChip, useResolvedMembers } from "@/components/discord-members"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { memberLabel } from "@/lib/discord-member-state"
import { answersInQuestionOrder, readAnswers } from "@/lib/forms"
import { useMounted } from "@/lib/use-mounted"
import type { FormQuestionRow, FormResponseRow } from "@/lib/api/xvm-api"

const PAGE_SIZE = 50

export interface FormResponsesProps {
  venueId: string
  formId: number
  questions: FormQuestionRow[]
}

export function FormResponses({ venueId, formId, questions }: FormResponsesProps) {
  const [responses, setResponses] = useState<FormResponseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const mounted = useMounted()
  const members = useResolvedMembers(venueId, responses.map((r) => r.discord_user_id))

  async function loadOlder(beforeId: number) {
    setLoading(true)
    setFailed(null)
    try {
      const rows = await apiRoute<FormResponseRow[]>("/api/venues/[venueId]/forms/[formId]/responses", {
        params: { venueId, formId },
        query: { beforeId: String(beforeId) },
      })
      setResponses((prev) => [...prev, ...rows])
      setMore(rows.length >= PAGE_SIZE)
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "Couldn't load the responses.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let current = true
    apiRoute<FormResponseRow[]>("/api/venues/[venueId]/forms/[formId]/responses", { params: { venueId, formId } })
      .then((rows) => {
        if (!current) return
        setResponses(rows)
        setMore(rows.length >= PAGE_SIZE)
      })
      .catch((e) => {
        if (current) setFailed(e instanceof ApiError ? e.message : "Couldn't load the responses.")
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [venueId, formId])

  if (failed) return <p className="text-sm text-destructive">{failed}</p>
  if (loading && responses.length === 0) return <p className="text-sm text-muted-foreground">Loading...</p>
  if (responses.length === 0) return <p className="text-sm text-muted-foreground">No one has submitted this form yet.</p>

  return (
    <div className="space-y-3">
      {responses.map((response) => {
        const member = members[response.discord_user_id]
        const answers = answersInQuestionOrder(readAnswers(response.answers), questions)
        return (
          <Card key={response.id}>
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <MemberChip label={memberLabel(response.discord_user_id, member)} avatarUrl={member?.avatarUrl} />
                {mounted && response.submitted_at && (
                  <span className="text-xs text-muted-foreground">{format(new Date(response.submitted_at), "PPp")}</span>
                )}
              </div>
              <dl className="space-y-2 text-sm">
                {answers.map((answer, index) => (
                  <div key={`${answer.questionId ?? "x"}-${index}`}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{answer.question}</dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {answer.answer.length === 0 ? <span className="text-muted-foreground">No answer</span> : answer.answer.join(", ")}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )
      })}
      {more && (
        <Button variant="outline" disabled={loading} onClick={() => loadOlder(responses[responses.length - 1].id)}>
          {loading ? "Loading..." : "Load older responses"}
        </Button>
      )}
    </div>
  )
}
