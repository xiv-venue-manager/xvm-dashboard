"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChannelPicker, useDiscordOptions } from "@/components/discord-picker"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import type { EmbedPostRow } from "@/lib/api/xvm-api"

export interface EmbedPostsProps {
  venueId: string
  embedId: number
  canManage: boolean
}

export function EmbedPosts({ venueId, embedId, canManage }: EmbedPostsProps) {
  const [posts, setPosts] = useState<EmbedPostRow[] | null>(null)
  const [channelId, setChannelId] = useState("")
  const [posting, setPosting] = useState(false)
  const channels = useDiscordOptions(venueId, "channels", posts !== null && posts.length > 0)
  const channelName = (id: string) => channels.options.find((o) => o.value === id)?.label ?? id

  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiRoute<EmbedPostRow[]>("/api/venues/[venueId]/embeds/[embedId]/posts", { params: { venueId, embedId } })
      .then((rows) => {
        if (!cancelled) setPosts(rows)
      })
      .catch((e) => {
        if (cancelled) return
        setPosts([])
        toast.error(e instanceof ApiError ? e.message : "Failed to load where this embed is posted.")
      })
    return () => {
      cancelled = true
    }
  }, [venueId, embedId, reloads])

  async function post() {
    if (!SNOWFLAKE_PATTERN.test(channelId)) {
      toast.error("Choose a channel to post in.")
      return
    }
    setPosting(true)
    try {
      await apiRoute("/api/venues/[venueId]/embeds/[embedId]/posts", {
        params: { venueId, embedId },
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      })
      toast.success("Sent to the bot. It posts shortly, use Refresh to see it.")
      setChannelId("")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to post the embed.")
    } finally {
      setPosting(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">Posted in</p>
          <Button size="sm" variant="outline" onClick={() => setReloads((n) => n + 1)}>
            Refresh
          </Button>
        </div>

        {posts === null ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not posted anywhere yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {posts.map((p) => (
              <li key={p.channel_id}>
                {channelName(p.channel_id)}
                {p.message_id === null && <span className="text-muted-foreground"> (waiting for the bot)</span>}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <ChannelPicker venueId={venueId} value={channelId} onChange={setChannelId} disabled={posting} />
            <Button size="sm" onClick={post} disabled={posting || !SNOWFLAKE_PATTERN.test(channelId)}>
              {posting ? "Posting..." : "Post"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
