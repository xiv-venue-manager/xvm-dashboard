export const QUOTE_PAGE_SIZE = 50

export function discordMessageUrl(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`
}

export function hasMoreQuotes(received: number): boolean {
  return received >= QUOTE_PAGE_SIZE
}
