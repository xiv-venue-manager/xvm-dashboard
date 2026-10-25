import "dotenv/config"
import { Client, GatewayIntentBits, Partials, Collection } from "discord.js"
import { BotClient } from "./types/index.js"
import { loadCommands } from "./handlers/commandHandler.js"
import { loadEvents } from "./handlers/eventHandler.js"
import { startWebhookServer } from "./webhook/server.js"

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
}) as BotClient

client.commands = new Collection()

client.on("error", (err) => console.error("[Client Error]", err))

await loadCommands(client)
await loadEvents(client)

client.once("clientReady", (c) => {
  startWebhookServer(c)
})

await client.login(process.env.DISCORD_TOKEN)
