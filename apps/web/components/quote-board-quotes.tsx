"use client"

import { useState } from "react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { MemberChip, useResolvedMembers } from "@/components/discord-members"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { memberLabel } from "@/lib/discord-member-state"
import { QUOTE_PAGE_SIZE, discordMessageUrl, hasMoreQuotes } from "@/lib/quote-board"
import { useMounted } from "@/lib/use-mounted"
import type { QuoteRow } from "@/lib/api/xvm-api"

export interface QuoteBoardQuotesProps {
  venueId: string
  canManage: boolean
  guildId: string | null
  quotes: QuoteRow[]
}

export function QuoteBoardQuotes({ venueId, canManage, guildId, quotes: initialQuotes }: QuoteBoardQuotesProps) {
  const [quotes, setQuotes] = useState(initialQuotes)
  const [more, setMore] = useState(hasMoreQuotes(initialQuotes.length))
  const [loading, setLoading] = useState(false)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<QuoteRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const mounted = useMounted()

  const members = useResolvedMembers(venueId, [...new Set(quotes.flatMap((q) => [q.author_id, q.quoted_by]))])

  async function loadOlder() {
    const last = quotes[quotes.length - 1]
    if (!last) return
    setLoading(true)
    try {
      const page = await apiRoute<QuoteRow[]>("/api/venues/[venueId]/quote-board/quotes", {
        params: { venueId },
        query: { beforeId: last.id, limit: QUOTE_PAGE_SIZE },
      })
      setQuotes((prev) => [...prev, ...page])
      setMore(hasMoreQuotes(page.length))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load older quotes.")
    } finally {
      setLoading(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiRoute("/api/venues/[venueId]/quote-board/quotes/[quoteId]", {
        params: { venueId, quoteId: deleteTarget.id },
        method: "DELETE",
      })
      setQuotes((prev) => prev.filter((q) => q.id !== deleteTarget.id))
      toast.success("Quote removed.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove the quote.")
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="font-semibold">Quotes</p>

      {quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No quotes saved yet.</p>
      ) : (
        quotes.map((quote) => {
          const author = members[quote.author_id]
          const saver = members[quote.quoted_by]
          const hidden = quote.attachment_spoiler && !revealed.has(quote.id)
          return (
            <Card key={quote.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <MemberChip label={memberLabel(quote.author_id, author)} avatarUrl={author?.avatarUrl} />
                  {mounted && (
                    <span className="text-xs text-muted-foreground">{format(new Date(quote.created_at), "PP")}</span>
                  )}
                </div>

                {quote.content !== "" && <p className="whitespace-pre-wrap break-words text-sm">{quote.content}</p>}

                {quote.attachment_url !== null && (
                  <div className="relative inline-block max-w-full overflow-hidden rounded-lg">
                    <img
                      src={quote.attachment_url}
                      alt="Attachment on this quote"
                      className={`max-h-72 max-w-full rounded-lg ${hidden ? "blur-xl" : ""}`}
                    />
                    {hidden && (
                      <button
                        type="button"
                        onClick={() => setRevealed((prev) => new Set(prev).add(quote.id))}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium"
                      >
                        Spoiler. Click to show.
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    Saved by <MemberChip label={memberLabel(quote.quoted_by, saver)} avatarUrl={saver?.avatarUrl} />
                  </span>
                  <span className="flex items-center gap-3">
                    {guildId !== null && (
                      <a
                        href={discordMessageUrl(guildId, quote.source_channel_id, quote.source_message_id)}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-[var(--xiv-blue)]"
                      >
                        View in Discord
                      </a>
                    )}
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(quote)}>
                        Remove
                      </Button>
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })
      )}

      {more && (
        <Button variant="outline" onClick={loadOlder} disabled={loading}>
          {loading ? "Loading..." : "Load older quotes"}
        </Button>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this quote?</AlertDialogTitle>
            <AlertDialogDescription>
              It is deleted from the venue and the bot takes its post off the board channel. The original message in
              Discord stays.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
