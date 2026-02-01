import { REST, Routes } from "discord.js";
import { config } from "dotenv";
import { voiceCommand } from "../src/tools/voice/commands.js";

config();

const commands = [
  voiceCommand.data.toJSON()
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

const CLIENT_ID = process.env.CLIENT_ID;

(async () => {
  try {
    console.log("Deploying global commands...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log("✅ Global commands deployed");
  } catch (error) {
    console.error(error);
  }
})();
