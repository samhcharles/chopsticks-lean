// src/index.js
import { Client, GatewayIntentBits, Collection, ActivityType } from "discord.js";
import { config } from "dotenv";

import { voiceCommand } from "./tools/voice/commands.js";
import voiceStateEvent from "./events/voiceStateUpdate.js";

config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

/* ---------- COMMAND MAP ---------- */

client.commands = new Collection();
client.commands.set(voiceCommand.data.name, voiceCommand);

/* ---------- INTERACTION ROUTER ---------- */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  await command.execute(interaction);
});

/* ---------- EVENTS ---------- */

client.on(voiceStateEvent.name, voiceStateEvent.execute);

/* ---------- READY ---------- */

client.once("clientReady", () => {
  client.user.setPresence({
    activities: [
      {
        name: "in development",
        type: ActivityType.Custom
      }
    ],
    status: "online"
  });

  console.log(`Logged in as ${client.user.tag}`);
});

/* ---------- LOGIN ---------- */

client.login(process.env.DISCORD_TOKEN);
