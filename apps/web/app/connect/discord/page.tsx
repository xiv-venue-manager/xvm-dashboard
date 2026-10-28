import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { getGuildPresence } from "@/lib/discord-rest"
import { administersGuild, discordGrantFromPage } from "@/lib/discord-user"
import { getVenue, getVenueByLink, type VenueRow } from "@/lib/api/xvm-api"
import { myVenues } from "@/lib/api/venue-access"
import { xvmPersonReader } from "@/lib/api/xvm-page-read"
import { connectView, guildIdFrom, hasLiveServer, ownedVenues, signInUrl } from "@/lib/connect-discord"
import { ConnectDiscord } from "./connect-discord"

export const metadata: Metadata = {
  title: "Connect a Discord Server",
  description: "Connect your Discord server to the venue it belongs to.",
}

export default async function ConnectDiscordPage({
  searchParams,
}: {
  searchParams: Promise<{ guild?: string | string[] }>
}) {
  const session = await getServerSession(authOptions)
  const guildId = guildIdFrom((await searchParams).guild)
  if (!session?.user) redirect(signInUrl(`/connect/discord?guild=${guildId ?? ""}`))
  if (!guildId) return <ConnectDiscord server={null} view={{ kind: "bad-link" }} />

  const read = await xvmPersonReader(session.user.id)
  const [presence, authority, current, mine] = await Promise.all([
    getGuildPresence(guildId),
    discordGrantFromPage().then((grant) => administersGuild(grant, guildId)),
    read<VenueRow | null | "unavailable">("connect discord: server", "unavailable", (token) =>
      getVenueByLink(token, "DiscordGuild", guildId)
    ),
    myVenues(session.user.id).catch((err) => {
      console.error("[connect discord] venues read error:", err)
      return "unavailable" as const
    }),
  ])

  const offered = current === null && mine !== "unavailable" && authority.ok && authority.administers
  const owned = offered ? ownedVenues(mine) : []
  const linked = await Promise.all(
    owned.map((venue) =>
      read("connect discord: venue links", false, async (token) => hasLiveServer(await getVenue(token, venue.id)))
    )
  )
  const connectedElsewhere = new Set(owned.filter((_, i) => linked[i]).map((v) => v.id))

  return (
    <ConnectDiscord
      server={{ id: guildId, name: presence.name, iconUrl: presence.iconUrl }}
      view={connectView({ botIsMember: presence.botIsMember, authority, current, mine, connectedElsewhere })}
    />
  )
}
