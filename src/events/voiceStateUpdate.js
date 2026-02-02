// src/events/voiceStateUpdate.js
import { ChannelType, PermissionsBitField } from "discord.js";
import { loadGuildData, saveGuildData } from "../utils/storage.js";
import {
  acquireCreationLock,
  releaseCreationLock,
  ensureVoiceState
} from "../tools/voice/state.js";
import { logger } from "../utils/logger.js";

export default {
  name: "voiceStateUpdate",

  async execute(oldState, newState) {
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;

    const member = newState.member ?? oldState.member;
    if (!member) return;

    let data;
    try {
      data = loadGuildData(guild.id);
      ensureVoiceState(data);
    } catch {
      logger.error("Failed to load guild data", { guildId: guild.id });
      return;
    }

    const voice = data.voice;
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    /* ---------- LEAVE / CLEANUP ---------- */

    if (oldChannelId && oldChannelId !== newChannelId) {
      const temp = voice.tempChannels[oldChannelId];
      if (temp) {
        const channel = guild.channels.cache.get(oldChannelId);
        if (!channel || channel.members.size === 0) {
          if (channel) {
            await channel.delete().catch(() => {});
          }
          delete voice.tempChannels[oldChannelId];
          saveGuildData(guild.id, data);
        }
      }
    }

    /* ---------- JOIN / CREATE ---------- */

    if (!newChannelId || newChannelId === oldChannelId) return;

    const lobby = voice.lobbies[newChannelId];
    if (!lobby || lobby.enabled !== true) return;

    // Existing temp channel reuse (idempotent)
    for (const [id, temp] of Object.entries(voice.tempChannels)) {
      if (temp.ownerId === member.id && temp.lobbyId === newChannelId) {
        const existing = guild.channels.cache.get(id);
        if (existing) {
          await member.voice.setChannel(existing).catch(() => {});
          return;
        }
      }
    }

    // Acquire creation lock
    if (!acquireCreationLock(guild.id, member.id)) return;

    try {
      // Re-load and re-validate after lock
      data = loadGuildData(guild.id);
      ensureVoiceState(data);

      const freshLobby = data.voice.lobbies[newChannelId];
      if (!freshLobby || freshLobby.enabled !== true) {
        return;
      }

      const category = guild.channels.cache.get(freshLobby.categoryId);
      if (!category || category.type !== ChannelType.GuildCategory) {
        logger.error("Invalid lobby category", {
          guildId: guild.id,
          categoryId: freshLobby.categoryId
        });
        return;
      }

      const bot = guild.members.me;
      if (
        !bot.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
        !bot.permissions.has(PermissionsBitField.Flags.MoveMembers)
      ) {
        logger.error("Missing permissions", { guildId: guild.id });
        return;
      }

      const channel = await guild.channels.create({
        name: freshLobby.nameTemplate.replace("{user}", member.user.username),
        type: ChannelType.GuildVoice,
        parent: freshLobby.categoryId
      });

      await member.voice.setChannel(channel).catch(() => {});

      data.voice.tempChannels[channel.id] = {
        ownerId: member.id,
        lobbyId: newChannelId
      };

      saveGuildData(guild.id, data);
    } catch (err) {
      logger.error("Temp channel creation failed", {
        guildId: guild.id,
        userId: member.id,
        err
      });
    } finally {
      releaseCreationLock(guild.id, member.id);
    }
  }
};
