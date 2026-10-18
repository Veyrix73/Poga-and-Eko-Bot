require("dotenv").config();
const { REST, Routes } = require("discord.js");
const commands = require("../src/command-definitions");

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!token || token === "replace_with_your_bot_token" || !clientId || clientId === "replace_with_your_application_id") {
    throw new Error("Set DISCORD_TOKEN and DISCORD_CLIENT_ID in your .env file before deploying commands.");
  }

  const rest = new REST({ version: "10" }).setToken(token);
  const body = await rest.put(
    process.env.DISCORD_GUILD_ID
      ? Routes.applicationGuildCommands(clientId, process.env.DISCORD_GUILD_ID)
      : Routes.applicationCommands(clientId),
    { body: commands }
  );

  console.log("Registered " + body.length + " slash commands" +
    (process.env.DISCORD_GUILD_ID ? " to guild " + process.env.DISCORD_GUILD_ID + "." : " globally."));
}

main().catch(error => {
  console.error("Command deployment failed:", error.message);
  process.exitCode = 1;
});
