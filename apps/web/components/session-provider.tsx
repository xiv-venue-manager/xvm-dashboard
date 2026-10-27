"use client"

import { useEffect, useRef } from "react"
import { SessionProvider as NextAuthSessionProvider, signOut, useSession } from "next-auth/react"
import { DELETION_SIGN_IN_URL } from "@/lib/sign-in-reason"

function EndSessionOnPendingDeletion() {
  const { data: session } = useSession()
  const ended = useRef(false)

  useEffect(() => {
    if (!session?.deletionPending || ended.current) return
    ended.current = true
    void signOut({ callbackUrl: DELETION_SIGN_IN_URL })
  }, [session?.deletionPending])

  return null
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <EndSessionOnPendingDeletion />
      {children}
    </NextAuthSessionProvider>
  )
}
