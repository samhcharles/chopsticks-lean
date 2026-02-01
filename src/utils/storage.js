// src/utils/storage.js
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function guildFile(guildId) {
  return path.join(DATA_DIR, `${guildId}.json`);
}

export function loadGuildData(guildId) {
  ensureDir();
  const file = guildFile(guildId);

  // ---------- BRAND NEW GUILD ----------
  if (!fs.existsSync(file)) {
    return {
      voice: {
        lobbies: {},
        tempChannels: {}
      }
    };
  }

  const data = JSON.parse(fs.readFileSync(file, "utf8"));

  // ---------- MIGRATION: legacy → canonical ----------
  if (!data.voice) {
    data.voice = {
      lobbies: data.lobbies ?? {},
      tempChannels: data.tempChannels ?? {}
    };

    delete data.lobbies;
    delete data.tempChannels;
  }

  // ---------- HARD GUARANTEES ----------
  data.voice.lobbies ??= {};
  data.voice.tempChannels ??= {};

  return data;
}

export function saveGuildData(guildId, data) {
  ensureDir();
  fs.writeFileSync(
    guildFile(guildId),
    JSON.stringify(data, null, 2)
  );
}
