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

function tempFile(guildId) {
  return path.join(DATA_DIR, `${guildId}.json.tmp`);
}

/* ---------------- SCHEMA GUARD ---------------- */

function validateGuildData(data) {
  if (!data || typeof data !== "object") return false;

  if (!data.voice || typeof data.voice !== "object") return false;
  if (typeof data.voice.lobbies !== "object") return false;
  if (typeof data.voice.tempChannels !== "object") return false;

  for (const [lobbyId, lobby] of Object.entries(data.voice.lobbies)) {
    if (!lobby || typeof lobby !== "object") return false;
    if (typeof lobby.categoryId !== "string") return false;
    if (typeof lobby.enabled !== "boolean") return false;
    if (typeof lobby.nameTemplate !== "string") return false;
  }

  for (const [channelId, temp] of Object.entries(data.voice.tempChannels)) {
    if (!temp || typeof temp !== "object") return false;
    if (typeof temp.ownerId !== "string") return false;
    if (typeof temp.lobbyId !== "string") return false;
  }

  return true;
}

/* ---------------- LOAD ---------------- */

export function loadGuildData(guildId) {
  ensureDir();
  const file = guildFile(guildId);

  if (!fs.existsSync(file)) {
    return {
      voice: {
        lobbies: {},
        tempChannels: {}
      }
    };
  }

  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    throw new Error(`Failed to read guild file ${guildId}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Corrupt JSON for guild ${guildId}`);
  }

  // Migration
  if (!data.voice) {
    data.voice = {
      lobbies: data.lobbies ?? {},
      tempChannels: data.tempChannels ?? {}
    };
    delete data.lobbies;
    delete data.tempChannels;
  }

  data.voice.lobbies ??= {};
  data.voice.tempChannels ??= {};

  if (!validateGuildData(data)) {
    throw new Error(`Invalid guild schema for ${guildId}`);
  }

  return data;
}

/* ---------------- SAVE (ATOMIC) ---------------- */

export function saveGuildData(guildId, data) {
  ensureDir();

  if (!validateGuildData(data)) {
    throw new Error(`Refusing to save invalid guild data for ${guildId}`);
  }

  const finalPath = guildFile(guildId);
  const tmpPath = tempFile(guildId);

  const json = JSON.stringify(data, null, 2);

  fs.writeFileSync(tmpPath, json, { encoding: "utf8" });
  fs.fsyncSync(fs.openSync(tmpPath, "r"));

  fs.renameSync(tmpPath, finalPath);
}
