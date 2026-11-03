FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json .npmrc pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
RUN pnpm install --frozen-lockfile --ignore-scripts

# Builder
FROM base AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_DISCORD_APPLICATION_ID
ENV NEXT_PUBLIC_DISCORD_APPLICATION_ID=$NEXT_PUBLIC_DISCORD_APPLICATION_ID
# Not a secret — a git commit SHA. Ties uploaded sourcemaps to the release
# name the runtime SDK auto-tags events with, so GlitchTip can symbolicate.
ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=$SENTRY_RELEASE
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web ./apps/web
COPY packages/types ./packages/types
WORKDIR /app/apps/web
# SENTRY_AUTH_TOKEN is a secret (grants release-write access) — mounted for
# this RUN only via BuildKit secrets, never baked into an ARG/ENV layer
# (those persist in `docker history`, unlike the two NEXT_PUBLIC_* values
# above which aren't secrets).
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)" pnpm build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy standalone bundle (mirrors monorepo structure due to outputFileTracingRoot)
COPY --from=builder /app/apps/web/.next/standalone ./
# Overlay static assets and public at the paths server.js expects
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Next.js disk-lru-cache needs a writable cache dir at runtime
RUN mkdir -p ./apps/web/.next/cache \
 && chown -R nextjs:nodejs ./apps/web/.next/cache

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/web/server.js"]
