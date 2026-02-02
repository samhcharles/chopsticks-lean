// src/tools/voice/commands.js
import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits
} from "discord.js";

import {
  addLobby,
  removeLobby,
  resetVoice,
  getStatus,
  setLobbyEnabled
} from "./controller.js";

export const voiceCommand = {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Join-to-create voice configuration")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
      sub
        .setName("add")
        .setDescription("Add a join-to-create lobby")
        .addChannelOption(opt =>
          opt
            .setName("channel")
            .setDescription("Lobby voice channel")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)
        )
        .addChannelOption(opt =>
          opt
            .setName("category")
            .setDescription("Category for created channels")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName("template")
            .setDescription("Channel name template (use {user})")
            .setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Remove a join-to-create lobby")
        .addChannelOption(opt =>
          opt
            .setName("channel")
            .setDescription("Lobby voice channel")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName("enable")
        .setDescription("Enable a voice lobby")
        .addChannelOption(opt =>
          opt
            .setName("channel")
            .setDescription("Lobby voice channel")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName("disable")
        .setDescription("Disable a voice lobby")
        .addChannelOption(opt =>
          opt
            .setName("channel")
            .setDescription("Lobby voice channel")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName("status")
        .setDescription("Show current voice configuration")
    )

    .addSubcommand(sub =>
      sub
        .setName("reset")
        .setDescription("Reset all voice configuration")
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "add") {
        const channel = interaction.options.getChannel("channel");
        const category = interaction.options.getChannel("category");
        const template =
          interaction.options.getString("template") ?? "{user}'s room";

        const result = await addLobby(
          guildId,
          channel.id,
          category.id,
          template
        );

        let content;
        if (result.ok) {
          content =
            `Voice lobby configuration created\n` +
            `Lobby channel: ${channel}\n` +
            `Category: ${category}\n` +
            `Name template: \`${template}\``;
        } else if (result.reason === "exists") {
          content =
            `Voice lobby configuration already exists\n` +
            `Lobby channel: ${channel}\n` +
            `Requested category: ${category}`;
        } else if (result.reason === "category-bound") {
          content =
            `Category already bound to a different lobby\n` +
            `Category: ${category}\n` +
            `Action blocked to preserve one-lobby-per-category`;
        } else {
          content =
            `Failed to add voice lobby configuration\n` +
            `Lobby channel: ${channel}\n` +
            `Category: ${category}`;
        }

        await interaction.reply({ content, flags: 64 });
        return;
      }

      if (sub === "remove") {
        const channel = interaction.options.getChannel("channel");
        const result = await removeLobby(guildId, channel.id);

        const content = result.ok
          ? `Voice lobby configuration removed\nLobby channel: ${channel}`
          : `No voice lobby configuration exists\nLobby channel: ${channel}`;

        await interaction.reply({ content, flags: 64 });
        return;
      }

      if (sub === "enable" || sub === "disable") {
        const channel = interaction.options.getChannel("channel");
        const enabled = sub === "enable";

        const result = await setLobbyEnabled(
          guildId,
          channel.id,
          enabled
        );

        let content;
        if (result.ok && result.noop) {
          content =
            `No state change applied\n` +
            `Lobby channel: ${channel}\n` +
            `Status: already ${enabled ? "enabled" : "disabled"}`;
        } else if (result.ok) {
          content =
            `Voice lobby state updated\n` +
            `Lobby channel: ${channel}\n` +
            `New status: ${enabled ? "enabled" : "disabled"}`;
        } else if (result.reason === "missing") {
          content =
            `No voice lobby configuration exists\n` +
            `Lobby channel: ${channel}`;
        } else {
          content =
            `Failed to update voice lobby state\n` +
            `Lobby channel: ${channel}`;
        }

        await interaction.reply({ content, flags: 64 });
        return;
      }

      if (sub === "status") {
        const status = await getStatus(guildId);
        await interaction.reply({
          content:
            "```json\n" +
            JSON.stringify(status, null, 2) +
            "\n```",
          flags: 64
        });
        return;
      }

      if (sub === "reset") {
        await resetVoice(guildId);
        await interaction.reply({
          content:
            "Voice configuration reset\n" +
            "All lobbies removed\n" +
            "All temp channel records cleared",
          flags: 64
        });
        return;
      }
    } catch (err) {
      console.error("voice command error:", err);
      if (!interaction.replied) {
        await interaction.reply({
          content:
            "Command failed due to internal error\n" +
            "Check logs for stack trace",
          flags: 64
        });
      }
    }
  }
};
