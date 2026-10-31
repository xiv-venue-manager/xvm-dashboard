import { NextAuthOptions } from "next-auth"
import type { JWT } from "next-auth/jwt"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import DiscordProvider from "next-auth/providers/discord"
import { prisma } from "@/lib/prisma"
import { exchangeToken, XvmApiError } from "@/lib/api/xvm-api"
import { xvmCredentialFrom, isXvmCredentialFresh, type XvmCredential } from "@/lib/api/xvm-api-store"
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie"

// For an existing account next-auth hands the callbacks the stored user row as `user`, so the
// avatar Discord holds now is only on `profile`.
function discordImage(profile: unknown): string | undefined {
  const url = (profile as { image_url?: unknown } | undefined)?.image_url
  return typeof url === "string" && url ? url : undefined
}

// Re-mint the xvm-api token when the JWT has none or it is near expiry. Only the NextAuth route
// handler runs this (app/api/auth/[...nextauth]/route.ts), because it is the one place the
// refreshed cookie is written back. getServerSession in a page or route handler discards the
// cookie, and xvm-api supersedes a person's earlier credential on every exchange, so minting
// there would revoke the token the cookie already holds.
// Non-fatal, except a 409: xvm-api has revoked every credential for an account that is scheduled
// for deletion (or deleted), so this session cannot continue.
//
// A page load fires several session fetches at once. xvm-api keeps one live Dashboard credential per
// person, so each extra exchange would revoke the one a sibling request is about to store. Callers
// for the same user within MINT_REUSE_MS share one exchange. It is per process, which is enough while
// one web container serves traffic.
const MINT_REUSE_MS = 60_000
const recentMints = new Map<string, { at: number; credential: Promise<XvmCredential> }>()

function mintOnce(userId: string, mint: () => Promise<XvmCredential>): Promise<XvmCredential> {
  const now = Date.now()
  for (const [id, entry] of recentMints) if (now - entry.at >= MINT_REUSE_MS) recentMints.delete(id)
  const hit = recentMints.get(userId)
  if (hit) return hit.credential
  const credential = mint()
  recentMints.set(userId, { at: now, credential })
  credential.catch(() => recentMints.delete(userId))
  return credential
}

export async function refreshXvmCredential(token: JWT): Promise<JWT> {
  if (!token.id || token.deletionPending) return token
  try {
    if (!isXvmCredentialFresh(token.xvm)) {
      const discordAccount = await prisma.account.findFirst({
        where: { userId: token.id as string, provider: "discord" },
      })
      if (discordAccount) {
        token.xvm = await mintOnce(token.id, async () =>
          xvmCredentialFrom(await exchangeToken(discordAccount.providerAccountId, (token.name as string) ?? "Unknown"))
        )
      }
    }
  } catch (err) {
    if (err instanceof XvmApiError && err.status === 409) {
      token.deletionPending = true
    } else {
      console.error("xvm-api token refresh failed:", err)
    }
  }
  return token
}

export const authOptions: NextAuthOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma as any),
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      issuer: "https://discord.com",
      // guilds is what lets an owner prove they administer the server they're linking.
      authorization: { params: { scope: "identify email guilds" } },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Allow sign in if user exists or can be created
      if (!user?.email && !account?.providerAccountId) {
        return false
      }
      // Refresh Discord avatar on every sign-in. PrismaAdapter only stores
      // image at account creation, so avatars go stale when users change them.
      // user.id is only present for existing users (new users get their id
      // after the adapter creates them post-callback).
      if (account?.provider === "discord" && user?.id) {
        const image = discordImage(profile)
        prisma.user
          .update({
            where: { id: user.id },
            data: {
              ...(image ? { image } : {}),
              discordId: account.providerAccountId,
            },
          })
          .catch(() => {})
      }
      return true
    },
    async jwt({ token, user, account, profile }) {
      // Initial sign in - user object is only available on first call
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.picture = user.image
      }
      if (account) {
        token.provider = account.provider
        const image = account.provider === "discord" ? discordImage(profile) : undefined
        if (image) token.picture = image
        if (account.provider === "discord" && account.access_token) {
          token.discord = {
            accessToken: account.access_token,
            expiresAt: account.expires_at ?? null,
            scope: account.scope ?? null,
          }
        }
      }
      // Mint an xvm-api person token on first sign-in. This is additive, not a
      // hard dependency for login, so xvm-api being down must never fail the
      // dashboard's own sign-in. Later re-mints are refreshXvmCredential, run by the route handler.
      const isFirstDiscordSignIn = Boolean(
        user && account?.provider === "discord" && account.providerAccountId
      )
      if (isFirstDiscordSignIn && account) {
        try {
          token.xvm = xvmCredentialFrom(await exchangeToken(account.providerAccountId, user.name ?? "Unknown", true))
        } catch (err) {
          console.error("xvm-api token exchange failed:", err)
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      if (token.deletionPending) {
        session.deletionPending = true
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
            name: SESSION_COOKIE_NAME,
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
    async signOut() {
      console.log("NextAuth signOut event")
    },
    async createUser(message) {
      console.log("NextAuth createUser event:", message.user?.id)
    },
    async linkAccount(message) {
      console.log("NextAuth linkAccount event:", message.account?.provider)
      if (message.account.provider === "discord") {
        await prisma.user.update({
          where: { id: message.user.id },
          data: { discordId: message.account.providerAccountId },
        })
      }
    },
    async session() {
      // Don't log session events in production to reduce noise
      if (process.env.NODE_ENV === "development") {
        console.log("NextAuth session event")
      }
    },
  },
}
