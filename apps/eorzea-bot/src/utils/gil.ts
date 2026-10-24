import prisma from "./prisma.js"

/**
 * Award Gil to a member, creating their discord_members row if it doesn't
 * exist yet (same upsert pattern messageCreate.ts uses for XP — a member
 * can earn Gil via reaction/suggest before ever sending a chat
 * message, so the row may not exist).
 */
export async function awardGil(discordId: string, guildId: string, amount: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO discord_members ("discordId", "guildId", gil)
    VALUES (${discordId}, ${guildId}, ${amount})
    ON CONFLICT ("discordId") DO UPDATE
      SET gil = discord_members.gil + ${amount},
          "updatedAt" = NOW()
  `
}

/**
 * True if this member currently has an active XP boost. Used by
 * messageCreate.ts to decide whether to double the chat-XP award.
 */
export async function hasActiveXpBoost(discordId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ active: boolean }[]>`
    SELECT ("xpBoostExpiresAt" IS NOT NULL AND "xpBoostExpiresAt" > NOW()) AS active
    FROM discord_members WHERE "discordId" = ${discordId}
  `
  return rows[0]?.active ?? false
}

/**
 * Attempt to consume one banked cooldown skip. Returns true if one was
 * available and consumed (caller should let the message earn XP despite
 * being on cooldown), false if none were available (caller should block
 * as normal).
 */
export async function consumeCooldownSkip(discordId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ cooldownSkips: number }[]>`
    UPDATE discord_members
    SET "cooldownSkips" = "cooldownSkips" - 1
    WHERE "discordId" = ${discordId} AND "cooldownSkips" > 0
    RETURNING "cooldownSkips"
  `
  return rows.length > 0
}

const XP_BOOST_COST = 500
const COOLDOWN_SKIP_COST = 100

/**
 * Spend 500 Gil on an XP boost. Extends the timer if one is already
 * active (max(now, currentExpiry) + 1h), never resets or rejects a
 * stacked purchase. Returns true if the purchase succeeded (had enough
 * Gil), false if the balance was insufficient (no row updated, no charge).
 */
export async function buyXpBoost(discordId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE discord_members
    SET "xpBoostExpiresAt" = GREATEST(COALESCE("xpBoostExpiresAt", NOW()), NOW()) + INTERVAL '1 hour',
        gil = gil - ${XP_BOOST_COST},
        "updatedAt" = NOW()
    WHERE "discordId" = ${discordId} AND gil >= ${XP_BOOST_COST}
    RETURNING id
  `
  return rows.length > 0
}

/**
 * Spend 100 Gil on one banked cooldown skip. Returns true if the
 * purchase succeeded, false if the balance was insufficient.
 */
export async function buyCooldownSkip(discordId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE discord_members
    SET "cooldownSkips" = "cooldownSkips" + 1,
        gil = gil - ${COOLDOWN_SKIP_COST},
        "updatedAt" = NOW()
    WHERE "discordId" = ${discordId} AND gil >= ${COOLDOWN_SKIP_COST}
    RETURNING id
  `
  return rows.length > 0
}

export { XP_BOOST_COST, COOLDOWN_SKIP_COST }
