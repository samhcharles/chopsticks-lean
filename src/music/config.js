// src/music/config.js
import { loadGuildData, saveGuildData } from "../utils/storage.js";

export function getMusicConfig(guildId) {
  const data = loadGuildData(guildId);
  const mode = String(data?.music?.defaultMode ?? "open").toLowerCase() === "dj" ? "dj" : "open";
  return { defaultMode: mode };
}

export function setDefaultMusicMode(guildId, mode) {
  const m = String(mode ?? "").toLowerCase() === "dj" ? "dj" : "open";
  const data = loadGuildData(guildId);
  data.music ??= {};
  data.music.defaultMode = m;
  saveGuildData(guildId, data);
  return { ok: true, defaultMode: m };
}
