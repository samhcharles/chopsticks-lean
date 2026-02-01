import "dotenv/config";
import { REST, Routes } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) {
  throw new Error("DISCORD_TOKEN is not set");
}

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function run() {
  if (GUILD_ID) {
    console.log("Nuking GUILD commands...");
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: [] }
    );
  }

  console.log("Nuking GLOBAL commands...");
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: [] }
  );

  console.log("Done.");
}

run();
