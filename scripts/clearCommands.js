import { REST, Routes } from "discord.js";
import { config } from "dotenv";

config();

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

const clientId = process.env.CLIENT_ID;

(async () => {
  try {
    // DELETE ALL GLOBAL COMMANDS
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: [] }
    );

    console.log("✅ All global commands cleared");
  } catch (err) {
    console.error(err);
  }
})();
