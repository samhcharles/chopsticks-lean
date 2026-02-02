// src/tools/voice/controller.js
import { loadGuildData, saveGuildData } from "../../utils/storage.js";

/* ---------- ADD LOBBY ---------- */

export async function addLobby(guildId, channelId, categoryId, template) {
  const data = loadGuildData(guildId);
  const voice = data.voice;

  if (voice.lobbies[channelId]) {
    return { ok: false, reason: "exists" };
  }

  for (const lobby of Object.values(voice.lobbies)) {
    if (lobby.categoryId === categoryId) {
      return { ok: false, reason: "category-bound" };
    }
  }

  voice.lobbies[channelId] = {
    categoryId,
    enabled: true,
    nameTemplate: template
  };

  saveGuildData(guildId, data);
  return { ok: true };
}

/* ---------- REMOVE LOBBY ---------- */

export async function removeLobby(guildId, channelId) {
  const data = loadGuildData(guildId);
  const voice = data.voice;

  if (!voice.lobbies[channelId]) {
    return { ok: false, reason: "missing" };
  }

  delete voice.lobbies[channelId];
  saveGuildData(guildId, data);
  return { ok: true };
}

/* ---------- ENABLE / DISABLE ---------- */

export async function setLobbyEnabled(guildId, channelId, enabled) {
  const data = loadGuildData(guildId);
  const lobby = data.voice.lobbies[channelId];

  if (!lobby) {
    return { ok: false, reason: "missing" };
  }

  // idempotent: same state is a success no-op
  if (lobby.enabled === enabled) {
    return { ok: true, noop: true };
  }

  lobby.enabled = enabled;
  saveGuildData(guildId, data);
  return { ok: true };
}

/* ---------- RESET ---------- */

export async function resetVoice(guildId) {
  const data = loadGuildData(guildId);
  data.voice = { lobbies: {}, tempChannels: {} };
  saveGuildData(guildId, data);
}

/* ---------- STATUS ---------- */

export async function getStatus(guildId) {
  const data = loadGuildData(guildId);
  return data.voice;
}
