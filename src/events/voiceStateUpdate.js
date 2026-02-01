// src/events/voiceStateUpdate.js
import { ChannelType, PermissionsBitField } from "discord.js";
import { loadGuildData, saveGuildData } from "../utils/storage.js";

export default {
  name: "voiceStateUpdate",

  async execute(oldState, newState) {
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;

    const guildId = guild.id;
    const member = newState.member ?? oldState.member;
    if (!member) return;

    const data = loadGuildData(guildId);

    // normalize
    data.voice ??= { lobbies: {}, tempChannels: {} };
    const voice = data.voice;

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    // ======================================================
    // PHASE 1 — LEAVE / CLEANUP (ALWAYS FIRST)
    // ======================================================
    if (oldChannelId && oldChannelId !== newChannelId) {
      const temp = voice.tempChannels[oldChannelId];

      if (temp) {
        const channel = guild.channels.cache.get(oldChannelId);

        if (!channel || channel.members.size === 0) {
          delete voice.tempChannels[oldChannelId];
          saveGuildData(guildId, data);

          if (channel) {
            await channel.delete().catch(() => {});
          }
        }
      }
    }

    // ======================================================
    // PHASE 2 — JOIN / CREATE
    // ======================================================
    if (newChannelId && newChannelId !== oldChannelId) {
      const lobby = voice.lobbies[newChannelId];
      if (!lobby) return;

      // only redirect if temp belongs to SAME lobby
      const existingEntry = Object.entries(voice.tempChannels)
        .find(([, v]) =>
          v.ownerId === member.id &&
          v.lobbyId === newChannelId
        );

      if (existingEntry) {
        const [existingTempId] = existingEntry;
        const existing = guild.channels.cache.get(existingTempId);
        if (existing) {
          await member.voice.setChannel(existing).catch(() => {});
          return;
        }
      }

      const channel = await guild.channels.create({
        name: lobby.nameTemplate
          ? lobby.nameTemplate.replace("{user}", member.user.username)
          : `${member.user.username}'s room`,
        type: ChannelType.GuildVoice,
        parent: lobby.categoryId,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.MoveMembers
            ]
          }
        ]
      });

      voice.tempChannels[channel.id] = {
        ownerId: member.id,
        lobbyId: newChannelId
      };

      saveGuildData(guildId, data);
      await member.voice.setChannel(channel).catch(() => {});
    }
  }
};
