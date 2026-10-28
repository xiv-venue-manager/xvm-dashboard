import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Create Your Venue",
  description: "Set up your FFXIV roleplay venue in under two minutes. Sign in with Discord and you're ready to go.",
}

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getGuildPresence } from "@/lib/discord-rest"
import { administersGuild, discordGrantFromPage } from "@/lib/discord-user"
import { guildIdFrom, signInUrl, type ConnectServer } from "@/lib/connect-discord"
import { GetStartedWizard } from "./wizard"

async function serverToConnect(guildId: string | null): Promise<ConnectServer | null> {
  if (!guildId) return null
  const [presence, authority] = await Promise.all([
    getGuildPresence(guildId),
    discordGrantFromPage().then((grant) => administersGuild(grant, guildId)),
  ])
  if (!presence.botIsMember || !authority.ok || !authority.administers) return null
  return { id: guildId, name: presence.name, iconUrl: presence.iconUrl }
}

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<{ guild?: string | string[] }>
}) {
  const session = await getServerSession(authOptions)
  const guildId = guildIdFrom((await searchParams).guild)
  if (!session?.user) redirect(signInUrl(guildId ? `/get-started?guild=${guildId}` : "/get-started"))

  return <GetStartedWizard server={await serverToConnect(guildId)} />
}
