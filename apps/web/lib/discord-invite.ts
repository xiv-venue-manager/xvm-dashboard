// Only client_id, so Discord applies the app's Default Install Settings (scopes and permissions).
export const DISCORD_BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_APPLICATION_ID}`
