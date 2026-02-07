// src/utils/logger.js
export function log(level, message, meta = {}) {
  const ts = new Date().toISOString();
  const payload =
    Object.keys(meta).length > 0
      ? ` ${JSON.stringify(meta)}`
      : "";
  console[level](`[${ts}] ${message}${payload}`);
}

export const logger = {
  info: (m, meta) => log("log", m, meta),
  warn: (m, meta) => log("warn", m, meta),
  error: (m, meta) => log("error", m, meta)
};