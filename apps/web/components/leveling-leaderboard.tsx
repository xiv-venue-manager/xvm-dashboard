"use client"

import { Fragment, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { colorToHex } from "@/lib/audit-log-events"
import { sourceLabel } from "@/lib/leveling"
import type { LevelingAwardRow, LevelingStanding } from "@/lib/api/xvm-api"

export interface LevelingLeaderboardProps {
  venueId: string
  xpName: string
  standings: LevelingStanding[]
}

type AwardState = { status: "loading" } | { status: "failed"; message: string } | { status: "done"; awards: LevelingAwardRow[] }

function TierBadge({ tier }: { tier: NonNullable<LevelingStanding["tier"]> }) {
  const colour = tier.color === null ? undefined : colorToHex(tier.color)
  return (
    <Badge variant="tag" style={colour ? { borderColor: colour, color: colour } : undefined}>
      {tier.icon ? `${tier.icon} ` : ""}
      {tier.name}
    </Badge>
  )
}

export function LevelingLeaderboard({ venueId, xpName, standings }: LevelingLeaderboardProps) {
  const [open, setOpen] = useState<number | null>(null)
  const [awards, setAwards] = useState<Record<number, AwardState>>({})

  async function toggle(personId: number) {
    if (open === personId) {
      setOpen(null)
      return
    }
    setOpen(personId)
    if (awards[personId]?.status === "done") return
    setAwards((prev) => ({ ...prev, [personId]: { status: "loading" } }))
    try {
      const rows = await apiRoute<LevelingAwardRow[]>("/api/venues/[venueId]/leveling/members/[personId]/awards", {
        params: { venueId, personId },
      })
      setAwards((prev) => ({ ...prev, [personId]: { status: "done", awards: rows } }))
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Couldn't load the award history."
      setAwards((prev) => ({ ...prev, [personId]: { status: "failed", message } }))
    }
  }

  if (standings.length === 0) {
    return <p className="text-sm text-muted-foreground">Nobody has earned {xpName} yet.</p>
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Level</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Progress</th>
                <th className="px-4 py-3 text-right font-medium">Total {xpName}</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((standing, index) => {
                const state = awards[standing.person_id]
                const isOpen = open === standing.person_id
                const percent =
                  standing.xp_for_next_level > 0
                    ? Math.min(100, Math.round((standing.xp_into_level / standing.xp_for_next_level) * 100))
                    : 0
                return (
                  <Fragment key={standing.person_id}>
                    <tr
                      className="cursor-pointer border-b last:border-0 hover:bg-[var(--blue-008)]"
                      onClick={() => toggle(standing.person_id)}
                    >
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{index + 1}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          className="flex flex-wrap items-center gap-2 text-left font-medium"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggle(standing.person_id)
                          }}
                        >
                          {standing.name}
                          {standing.tier && <TierBadge tier={standing.tier} />}
                        </button>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{standing.level}</td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-1.5 w-32 overflow-hidden rounded-full bg-[var(--blue-018)]"
                            role="progressbar"
                            aria-valuenow={percent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${standing.name} level progress`}
                          >
                            <div className="h-full bg-[var(--xiv-blue)]" style={{ width: `${percent}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {standing.xp_into_level} / {standing.xp_for_next_level}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{standing.total_xp.toLocaleString()}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b bg-[var(--blue-008)] last:border-0">
                        <td colSpan={5} className="px-4 py-3">
                          {!state || state.status === "loading" ? (
                            <p className="text-sm text-muted-foreground">Loading...</p>
                          ) : state.status === "failed" ? (
                            <p className="text-sm text-destructive">{state.message}</p>
                          ) : state.awards.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No awards yet.</p>
                          ) : (
                            <ul className="space-y-1 text-sm">
                              {state.awards.map((award) => (
                                <li key={award.id} className="flex flex-wrap justify-between gap-2">
                                  <span>
                                    {sourceLabel(award.source_key)}
                                    {award.note ? <span className="text-muted-foreground">, {award.note}</span> : null}
                                  </span>
                                  <span className="tabular-nums text-muted-foreground">
                                    +{award.xp_amount} {xpName}, {new Date(award.awarded_at).toLocaleString()}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
