// src/tools/voice/cleanup.js
import { loadGuildData, saveGuildData } from "../../utils/storage.js";

export async function cleanupVoice(client) {
  for (const guild of client.guilds.cache.values()) {
    let data;
    try {
      data = loadGuildData(guild.id);
    } catch {
      continue;
    }

    const voice = data.voice;
    let mutated = false;

    for (const [channelId, temp] of Object.entries(voice.tempChannels)) {
      const channel = guild.channels.cache.get(channelId);

      if (!channel || channel.members.size === 0) {
        delete voice.tempChannels[channelId];
        mutated = true;

        if (channel) {
          await channel.delete().catch(() => {});
        }
      }
    }

    if (mutated) {
      try {
        saveGuildData(guild.id, data);
      } catch {}
    }
  }
}
