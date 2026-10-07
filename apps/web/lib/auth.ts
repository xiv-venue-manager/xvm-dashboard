import { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import DiscordProvider from "next-auth/providers/discord"
import { prisma } from "@/lib/prisma"
import { exchangeToken } from "@/lib/api/xvm-api"
import { upsertXvmApiCredential, getValidXvmApiToken } from "@/lib/api/xvm-api-store"

export const authOptions: NextAuthOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma as any),
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      issuer: "https://discord.com",
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Allow sign in if user exists or can be created
      if (!user?.email && !account?.providerAccountId) {
        return false
      }
      // Refresh Discord avatar on every sign-in. PrismaAdapter only stores
      // image at account creation, so avatars go stale when users change them.
      // user.id is only present for existing users (new users get their id
      // after the adapter creates them post-callback).
      if (account?.provider === "discord" && user?.id) {
        prisma.user
          .update({
            where: { id: user.id },
            data: {
              ...(user.image ? { image: user.image } : {}),
              discordId: account.providerAccountId,
            },
          })
          .catch(() => {})
      }
      return true
    },
    async jwt({ token, user, account }) {
      // Initial sign in - user object is only available on first call
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.picture = user.image
      }
      // Persist the OAuth access_token to the token right after signin
      if (account) {
        token.accessToken = account.access_token
        token.provider = account.provider
      }
      // Mint an xvm-api person token on first sign-in. This is additive, not a
      // hard dependency for login, so xvm-api being down must never fail the
      // dashboard's own sign-in.
      const isFirstDiscordSignIn = Boolean(
        user && account?.provider === "discord" && account.providerAccountId
      )
      if (isFirstDiscordSignIn && account) {
        try {
          const issued = await exchangeToken(account.providerAccountId, user.name ?? "Unknown")
          await upsertXvmApiCredential(user.id, issued)
        } catch (err) {
          console.error("xvm-api token exchange failed:", err)
        }
      }
      // Refresh the xvm-api token on every callback invocation if it's missing
      // or near expiry. Same non-fatal handling as above.
      if (token.id && !isFirstDiscordSignIn) {
        try {
          const existing = await getValidXvmApiToken(token.id as string)
          if (!existing) {
            const discordAccount = await prisma.account.findFirst({
              where: { userId: token.id as string, provider: "discord" },
            })
            if (discordAccount) {
              const issued = await exchangeToken(discordAccount.providerAccountId, (token.name as string) ?? "Unknown")
              await upsertXvmApiCredential(token.id as string, issued)
            }
          }
        } catch (err) {
          console.error("xvm-api token refresh failed:", err)
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
    // Prevent open redirect attacks
    async redirect({ url, baseUrl }) {
      // Allow relative URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`
      // Allow same origin and trusted subdomain URLs
      try {
        const parsed = new URL(url)
        if (parsed.origin === baseUrl) return url
        if (parsed.hostname.endsWith(".xivvenuemanager.com")) return url
      } catch {
        // Invalid URL, return baseUrl
      }
      return baseUrl
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  // Scope session cookie to parent domain so subdomains (shout.xivvenuemanager.com) can read it
  cookies:
    process.env.NODE_ENV === "production"
      ? {
          sessionToken: {
            name: `__Secure-next-auth.session-token`,
            options: {
              httpOnly: true,
              sameSite: "lax" as const,
              path: "/",
              domain: ".xivvenuemanager.com",
              secure: true,
            },
          },
        }
      : undefined,
  // Trust the host header (important for proxies like Vercel)
  // @ts-expect-error - trustHost is valid in NextAuth v4 but might be missing in type definitions
  trustHost: true,
  // Debug must be explicitly opted into. NODE_ENV is untrusted in prod
  // containers and can leak verbose auth logs if set wrong.
  debug: process.env.NEXTAUTH_DEBUG === "true",
  events: {
    async signIn(message) {
      console.log("NextAuth signIn event:", message.user?.id)
    },
    async signOut(message) {
      console.log("NextAuth signOut event")
    },
    async createUser(message) {
      console.log("NextAuth createUser event:", message.user?.id)
    },
    async linkAccount(message) {
      console.log("NextAuth linkAccount event:", message.account?.provider)
    },
    async session(message) {
      // Don't log session events in production to reduce noise
      if (process.env.NODE_ENV === "development") {
        console.log("NextAuth session event")
      }
    },
  },
}
