import { NextAuthOptions } from "next-auth"
import DiscordProvider from "next-auth/providers/discord"
import { exchangeToken, XvmApiError } from "@/lib/api/xvm-api"
import { upsertXvmApiCredential, getValidXvmApiToken } from "@/lib/api/xvm-api-store"
import { SESSION_COOKIE_NAME, SESSION_COOKIE_SECURE } from "@/lib/session-cookie"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"

// For an existing account next-auth hands the callbacks the stored user row as `user`, so the
// avatar Discord holds now is only on `profile`.
function discordImage(profile: unknown): string | undefined {
  const url = (profile as { image_url?: unknown } | undefined)?.image_url
  return typeof url === "string" && url ? url : undefined
}

// A page load fires several session fetches at once and each finds the credential missing. Every
// exchange revokes the one before it, so callers for the same person share the exchange that is
// already running. The stored credential covers everything after it finishes.
const minting = new Map<string, Promise<void>>()

function mintOnce(userId: string, mint: () => Promise<void>): Promise<void> {
  const running = minting.get(userId)
  if (running) return running
  const started = mint().finally(() => minting.delete(userId))
  minting.set(userId, started)
  return started
}

export const authOptions: NextAuthOptions = {
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
    async signIn({ account }) {
      return Boolean(account?.providerAccountId)
    },
    async jwt({ token, user, account, profile }) {
      // Initial sign in - user object is only available on first call
      if (user) {
        token.email = user.email
        token.name = user.name
        token.picture = user.image
      }
      if (account) {
        token.id = account.providerAccountId
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
      // dashboard's own sign-in.
      const isFirstDiscordSignIn = Boolean(
        user && account?.provider === "discord" && account.providerAccountId
      )
      if (isFirstDiscordSignIn && account) {
        try {
          const issued = await exchangeToken(account.providerAccountId, user.name ?? "Unknown", true)
          await upsertXvmApiCredential(account.providerAccountId, issued)
        } catch (err) {
          console.error("xvm-api token exchange failed:", err)
        }
      }
      // Refresh the xvm-api token on every callback invocation if it's missing
      // or near expiry. Same non-fatal handling as above, except a 409: xvm-api
      // has revoked every credential for an account that is scheduled for
      // deletion (or deleted), so this session cannot continue.
      if (SNOWFLAKE_PATTERN.test(token.id ?? "") && !isFirstDiscordSignIn && !token.deletionPending) {
        try {
          const userId = token.id as string
          if (!(await getValidXvmApiToken(userId))) {
            await mintOnce(userId, async () => {
              if (await getValidXvmApiToken(userId)) return
              const issued = await exchangeToken(userId, (token.name as string) ?? "Unknown")
              await upsertXvmApiCredential(userId, issued)
            })
          }
        } catch (err) {
          if (err instanceof XvmApiError && err.status === 409) {
            token.deletionPending = true
          } else {
            console.error("xvm-api token refresh failed:", err)
          }
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
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: SESSION_COOKIE_SECURE,
        ...(SESSION_COOKIE_SECURE ? { domain: ".xivvenuemanager.com" } : {}),
      },
    },
  },
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
    async session() {
      // Don't log session events in production to reduce noise
      if (process.env.NODE_ENV === "development") {
        console.log("NextAuth session event")
      }
    },
  },
}
