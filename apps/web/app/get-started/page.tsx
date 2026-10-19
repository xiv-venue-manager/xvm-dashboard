import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Create Your Venue",
  description: "Set up your FFXIV roleplay venue in under two minutes. Sign in with Discord and you're ready to go.",
}

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { GetStartedWizard } from "./wizard"

export default async function GetStartedPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin?callbackUrl=/get-started")

  return <GetStartedWizard />
}
