// src/utils/storage.js
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const SCHEMA_VERSION = 1;
const MAX_SAVE_RETRIES = 5;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function guildFile(guildId) {
  return path.join(DATA_DIR, `${guildId}.json`);
}

function baseData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    rev: 0,
    voice: { lobbies: {}, tempChannels: {} },
    music: { defaultMode: "open" } // "open" | "dj"
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function normalizeMusic(raw) {
  const m = isPlainObject(raw?.music) ? { ...raw.music } : {};
  const defaultMode = String(m.defaultMode ?? "open").toLowerCase();
  m.defaultMode = defaultMode === "dj" ? "dj" : "open";
  return m;
}

function normalizeData(input) {
  const raw = isPlainObject(input) ? input : {};
  const out = { ...raw };

  const legacyLobbies = isPlainObject(raw.lobbies) ? raw.lobbies : null;
  const legacyTemp = isPlainObject(raw.tempChannels) ? raw.tempChannels : null;

  const voice = isPlainObject(raw.voice) ? { ...raw.voice } : {};
  if (!isPlainObject(voice.lobbies) && legacyLobbies) voice.lobbies = legacyLobbies;
  if (!isPlainObject(voice.tempChannels) && legacyTemp) voice.tempChannels = legacyTemp;

  if (!isPlainObject(voice.lobbies)) voice.lobbies = {};
  if (!isPlainObject(voice.tempChannels)) voice.tempChannels = {};

  out.voice = voice;
  out.music = normalizeMusic(raw);

  out.schemaVersion = Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : SCHEMA_VERSION;
  out.rev = Number.isInteger(raw.rev) && raw.rev >= 0 ? raw.rev : 0;

  if ("lobbies" in out) delete out.lobbies;
  if ("tempChannels" in out) delete out.tempChannels;

  return out;
}

function detectNeedsMigration(raw, normalized) {
  if (!isPlainObject(raw)) return true;
  if (!Number.isInteger(raw.schemaVersion)) return true;
  if (!Number.isInteger(raw.rev)) return true;

  if (!isPlainObject(raw.voice)) return true;
  if (!isPlainObject(raw.voice.lobbies)) return true;
  if (!isPlainObject(raw.voice.tempChannels)) return true;

  // music is now part of schema
  if (!isPlainObject(raw.music)) return true;

  if ("lobbies" in raw || "tempChannels" in raw) return true;

  if (normalized.schemaVersion !== raw.schemaVersion) return true;
  if (normalized.rev !== raw.rev) return true;

  // normalize could have corrected music fields
  if (normalized.music?.defaultMode !== raw.music?.defaultMode) return true;

  return false;
}

function readFileIfValid(file) {
  if (!fs.existsSync(file)) return { data: null, needsWrite: true };

  try {
    const rawText = fs.readFileSync(file, "utf8");
    const raw = JSON.parse(rawText);
    const normalized = normalizeData(raw);
    const needsWrite = detectNeedsMigration(raw, normalized);
    return { data: normalized, needsWrite };
  } catch {
    return { data: null, needsWrite: true };
  }
}

function readGuildDataWithFallback(file) {
  const primary = readFileIfValid(file);
  if (primary.data) return primary;

  const bak = `${file}.bak`;
  const fallback = readFileIfValid(bak);
  if (fallback.data) return { data: fallback.data, needsWrite: true };

  return { data: baseData(), needsWrite: true };
}

function uniqueTmpPath(file) {
  const rand = crypto.randomBytes(8).toString("hex");
  return `${file}.tmp.${process.pid}.${rand}`;
}

function writeAtomicJson(file, data) {
  const tmp = uniqueTmpPath(file);
  const bak = `${file}.bak`;
  const json = JSON.stringify(data, null, 2);

  fs.writeFileSync(tmp, json, "utf8");
  try {
    const fd = fs.openSync(tmp, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {}

  if (fs.existsSync(file)) {
    try {
      fs.copyFileSync(file, bak);
    } catch {}
  }

  fs.renameSync(tmp, file);
}

function mergeOnConflict(latest, incoming) {
  const a = normalizeData(latest);
  const b = normalizeData(incoming);

  const mergedVoice = {
    ...a.voice,
    ...b.voice,
    lobbies: { ...a.voice.lobbies, ...b.voice.lobbies },
    tempChannels: { ...a.voice.tempChannels, ...b.voice.tempChannels }
  };

  const mergedMusic = {
    ...a.music,
    ...b.music
  };

  return {
    ...a,
    ...b,
    voice: mergedVoice,
    music: mergedMusic,
    schemaVersion: SCHEMA_VERSION
  };
}

export function loadGuildData(guildId) {
  ensureDir();
  const file = guildFile(guildId);
  const { data } = readGuildDataWithFallback(file);
  return data ?? baseData();
}

export function ensureGuildData(guildId) {
  ensureDir();
  const file = guildFile(guildId);
  const { data, needsWrite } = readGuildDataWithFallback(file);
  if (needsWrite) {
    try {
      saveGuildData(guildId, data);
    } catch {}
  }
  return data;
}

export function saveGuildData(guildId, data) {
  ensureDir();
  const file = guildFile(guildId);

  let next = normalizeData(data);

  for (let attempt = 0; attempt < MAX_SAVE_RETRIES; attempt += 1) {
    const current = readGuildDataWithFallback(file).data ?? baseData();
    const expectedRev = Number.isInteger(next.rev) ? next.rev : current.rev;

    if (current.rev !== expectedRev) {
      next = mergeOnConflict(current, next);
      next.rev = current.rev;
      continue;
    }

    const toWrite = {
      ...next,
      schemaVersion: SCHEMA_VERSION,
      rev: current.rev + 1
    };

    writeAtomicJson(file, toWrite);
    return toWrite;
  }

  throw new Error("save-conflict");
}
