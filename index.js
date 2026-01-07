import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import dotenv from "dotenv";
import AternosController from "./aternosController.js";

dotenv.config();

import express from "express";
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot is running! 🤖");
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const commands = [
  new SlashCommandBuilder()
    .setName("startserver")
    .setDescription("Start the Aternos Minecraft server"),

  new SlashCommandBuilder()
    .setName("serverstatus")
    .setDescription("Check the current status of the Aternos server"),

  new SlashCommandBuilder()
    .setName("serverhelp")
    .setDescription("Show all available server commands"),
].map((command) => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("Started refreshing application (/) commands.");
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
      body: commands,
    });
    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error("Error registering commands:", error);
  }
}

client.once("ready", async () => {
  console.log(`Bot is online as ${client.user.tag}!`);
  await registerCommands();
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  const createEmbed = (title, description, color) => {
    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp()
      .setFooter({ text: "Aternos Server Manager" });
  };

  if (commandName === "serverhelp") {
    const helpEmbed = createEmbed(
      "Aternos Server Commands",
      "`/startserver` - Start your Minecraft server\n" +
        "`/serverstatus` - Check server status\n" +
        "`/serverhelp` - Show this help message",
      0x00ae86
    );
    await interaction.reply({ embeds: [helpEmbed] });
    return;
  }

  if (commandName === "startserver") {
    await interaction.deferReply();

    const workingEmbed = createEmbed(
      "Starting server...",
      "Please wait",
      0xffa500
    );
    await interaction.editReply({ embeds: [workingEmbed] });

    let controller;
    try {
      controller = new AternosController(
        process.env.ATERNOS_USERNAME,
        process.env.ATERNOS_PASSWORD,
        process.env.ATERNOS_SERVER_NAME || null,
        process.env.DEBUG_MODE === "true"
      );

      await controller.initialize();
      await controller.login();
      const result = await controller.startServer();

      let statusEmoji = "🟢";
      let statusColor = 0x00ff00;
      let message = "Server is online!";

      if (
        result.status.includes("starting") ||
        result.status.includes("loading")
      ) {
        statusEmoji = "🟡";
        statusColor = 0xffff00;
        message = "Server is starting up...";
      }

      const successEmbed = createEmbed(
        `${statusEmoji} ${message}`,
        `Status: ${result.status}`,
        statusColor
      );

      await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
      console.error("Error starting server:", error);

      const errorEmbed = createEmbed(
        "Failed to start server",
        `Error: ${error.message}`,
        0xff0000
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    } finally {
      if (controller) {
        await controller.close();
      }
    }
  }

  if (commandName === "serverstatus") {
    await interaction.deferReply();

    const workingEmbed = createEmbed(
      "Checking status...",
      "Please wait",
      0xffa500
    );
    await interaction.editReply({ embeds: [workingEmbed] });

    let controller;
    try {
      controller = new AternosController(
        process.env.ATERNOS_USERNAME,
        process.env.ATERNOS_PASSWORD,
        process.env.ATERNOS_SERVER_NAME || null,
        process.env.DEBUG_MODE === "true"
      );

      await controller.initialize();
      await controller.login();

      await controller.page.goto("https://aternos.org/servers/", {
        waitUntil: "networkidle0",
      });
      await controller.page.waitForSelector(".server-body, .server-card", {
        timeout: 15000,
      });
      await controller.page.click(".server-body, .server-card");
      await controller.page.waitForTimeout(3000);

      const result = await controller.getServerStatus();

      let statusEmoji = "🔴";
      let statusColor = 0xff0000;

      if (result.status.toLowerCase().includes("online")) {
        statusEmoji = "🟢";
        statusColor = 0x00ff00;
      } else if (
        result.status.toLowerCase().includes("starting") ||
        result.status.toLowerCase().includes("loading")
      ) {
        statusEmoji = "🟡";
        statusColor = 0xffff00;
      }

      const statusEmbed = createEmbed(
        `${statusEmoji} Server Status`,
        `**Status:** ${result.status}\n` +
          `**Players:** ${result.players}\n` +
          (result.address ? `**Address:** \`${result.address}\`` : ""),
        statusColor
      );

      await interaction.editReply({ embeds: [statusEmbed] });
    } catch (error) {
      console.error("Error checking status:", error);

      const errorEmbed = createEmbed(
        "Failed to check status",
        `Error: ${error.message}`,
        0xff0000
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    } finally {
      if (controller) {
        await controller.close();
      }
    }
  }
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error("Failed to login to Discord:", error);
  process.exit(1);
});
