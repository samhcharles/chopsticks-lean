// src/tools/voice/controller.js
import { loadGuildData, saveGuildData } from "../../utils/storage.js";

/*
Authoritative data model:

{
  lobbies: {
    [lobbyChannelId]: {
      categoryId,
      enabled: true | false
    }
  },
  tempChannels: {
    [tempChannelId]: {
      ownerId,
      lobbyId
    }
  }
}
*/

export const addLobby = async (guildId, lobbyChannelId, categoryId) => {
  const data = loadGuildData(guildId);

  // Already exists and enabled → no-op
  if (data.lobbies[lobbyChannelId]?.enabled) {
    return false;
  }

  data.lobbies[lobbyChannelId] = {
    categoryId,
    enabled: true
  };

  saveGuildData(guildId, data);
  return true;
};

export const removeLobby = async (guildId, lobbyChannelId) => {
  const data = loadGuildData(guildId);

  const lobby = data.lobbies[lobbyChannelId];
  if (!lobby || lobby.enabled === false) {
    return false;
  }

  // Disable instead of deleting — prevents resurrection loop
  data.lobbies[lobbyChannelId].enabled = false;

  // Clean up orphan temp channels defensively
  for (const tempId of Object.keys(data.tempChannels)) {
    if (data.tempChannels[tempId].lobbyId === lobbyChannelId) {
      delete data.tempChannels[tempId];
    }
  }

  saveGuildData(guildId, data);
  return true;
};

export const resetVoice = async (guildId) => {
  saveGuildData(guildId, {
    lobbies: {},
    tempChannels: {}
  });
};

export const getStatus = async (guildId) => {
  return loadGuildData(guildId);
};
