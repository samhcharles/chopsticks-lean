// src/lavalink/agentLavalink.js
import { LavalinkManager } from "lavalink-client";

// One LavalinkManager per agent client.
// Sessions are keyed by `${guildId}:${voiceChannelId}` to allow multi-channel per guild (via multiple agents).
export function createAgentLavalink(agentClient) {
  if (!agentClient?.user?.id) throw new Error("agent-client-not-ready");

  let manager = null;
  let rawHooked = false;

  const ctxBySession = new Map(); // sessionKey -> ctx
  const locks = new Map(); // sessionKey -> Promise chain

  function clampMs(v, fallback, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }

  const STOP_GRACE_MS = clampMs(process.env.MUSIC_STOP_GRACE_MS, 15_000, 0, 300_000);

  function ensureRawHook() {
    if (rawHooked) return;
    rawHooked = true;

    agentClient.on("raw", d => {
      try {
        manager?.sendRawData(d);
      } catch {}
    });
  }

  function bindErrorHandlersOnce() {
    if (!manager) return;
    if (manager.__chopsticksBound) return;
    manager.__chopsticksBound = true;

    try {
      manager.on("error", err => {
        console.error("[agent:lavalink:manager:error]", err?.message ?? err);
      });
    } catch {}

    try {
      manager.nodeManager?.on?.("disconnect", node => {
        console.error("[agent:lavalink:node:disconnect]", node?.options?.id ?? "node");
      });
      manager.nodeManager?.on?.("reconnecting", node => {
        console.error("[agent:lavalink:node:reconnecting]", node?.options?.id ?? "node");
      });
      manager.nodeManager?.on?.("error", (node, err) => {
        console.error(
          "[agent:lavalink:node:error]",
          node?.options?.id ?? "node",
          err?.message ?? err
        );
      });
    } catch {}
  }

  async function start() {
    if (manager) return manager;

    manager = new LavalinkManager({
      nodes: [
        {
          id: "main",
          host: process.env.LAVALINK_HOST || "localhost",
          port: Number(process.env.LAVALINK_PORT) || 2333,
          authorization: process.env.LAVALINK_PASSWORD || "youshallnotpass"
        }
      ],
      sendToShard: (guildId, payload) => {
        const guild = agentClient.guilds.cache.get(guildId);
        guild?.shard?.send(payload);
      },
      client: {
        id: agentClient.user.id,
        username: agentClient.user.username
      },
      autoSkip: true,
      playerOptions: {
        defaultSearchPlatform: "ytsearch",
        onDisconnect: { autoReconnect: true, destroyPlayer: false },
        onEmptyQueue: { destroyAfterMs: 300_000 }
      }
    });

    ensureRawHook();
    bindErrorHandlersOnce();

    await manager.init({ id: agentClient.user.id, username: agentClient.user.username });
    return manager;
  }

  function sessionKey(guildId, voiceChannelId) {
    return `${guildId}:${voiceChannelId}`;
  }

  function normalizeSearchQuery(input) {
    const q = String(input ?? "").trim();
    if (!q) return "";
    if (/^https?:\/\//i.test(q)) return q;
    return `ytsearch:${q}`;
  }

  function withSessionLock(key, fn) {
    const prev = locks.get(key) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(fn)
      .finally(() => {
        if (locks.get(key) === next) locks.delete(key);
      });

    locks.set(key, next);
    return next;
  }

  function withCtxLock(ctx, fn) {
    const key = sessionKey(ctx.guildId, ctx.voiceChannelId);
    return withSessionLock(key, fn);
  }

  function assertOwner(ctx, userId) {
    if (!userId) throw new Error("missing-owner");
    if (ctx.ownerId !== userId) throw new Error("not-owner");
  }

  function getCurrent(player) {
    return player?.queue?.current ?? null;
  }

  function getQueueTracks(player) {
    const q = player?.queue;
    if (!q) return [];
    if (Array.isArray(q.tracks)) return q.tracks;
    if (Array.isArray(q.items)) return q.items;
    if (Array.isArray(q)) return q;
    return [];
  }

  function bestEffortClearQueue(player) {
    const q = player?.queue;
    if (!q) return;

    try {
      if (typeof q.clear === "function") return q.clear();
    } catch {}

    try {
      if (Array.isArray(q)) return void (q.length = 0);
      if (Array.isArray(q.tracks)) return void (q.tracks.length = 0);
      if (typeof q.splice === "function" && typeof q.length === "number") return void q.splice(0, q.length);
    } catch {}
  }

  function markStopping(ctx, ms) {
    ctx.__stopping = true;
    ctx.__destroyAt = Date.now() + Math.max(0, Math.trunc(ms));
    if (ctx.__destroyTimer) clearTimeout(ctx.__destroyTimer);
    ctx.__destroyTimer = setTimeout(() => {
      try {
        destroySession(ctx.guildId, ctx.voiceChannelId);
      } catch {}
    }, Math.max(0, Math.trunc(ms)));
  }

  function stoppingRemainingMs(ctx) {
    if (!ctx?.__stopping || !ctx.__destroyAt) return 0;
    return Math.max(0, ctx.__destroyAt - Date.now());
  }

  function clearStopping(ctx) {
    if (!ctx) return;
    ctx.__stopping = false;
    ctx.__destroyAt = null;
    if (ctx.__destroyTimer) {
      clearTimeout(ctx.__destroyTimer);
      ctx.__destroyTimer = null;
    }
  }

  async function safePause(player, state) {
    try {
      await Promise.resolve(player.pause(state));
      return { ok: true, action: state ? "paused" : "resumed" };
    } catch (err) {
      const msg = String(err?.message ?? err);

      if (state === true && msg.toLowerCase().includes("already paused")) {
        return { ok: true, action: "already-paused" };
      }
      if (
        state === false &&
        (msg.toLowerCase().includes("already playing") || msg.toLowerCase().includes("not paused"))
      ) {
        return { ok: true, action: "already-playing" };
      }

      return { ok: false, error: msg };
    }
  }

  async function softStopPlayback(player) {
    // STOP AUDIO NOW, KEEP VOICE CONNECTED.
    // Do NOT destroy the player here; destroy only after the grace timer.
    try {
      bestEffortClearQueue(player);
    } catch {}

    try {
      if (typeof player.stop === "function") await Promise.resolve(player.stop());
    } catch {}

    // Force paused so "playing" doesn't keep flipping true for some node states.
    try {
      if (typeof player.pause === "function") await Promise.resolve(player.pause(true));
    } catch {}
  }

  async function recreatePlayer(ctx) {
    if (!manager) throw new Error("lavalink-not-ready");
    const player = manager.createPlayer({
      guildId: ctx.guildId,
      voiceChannelId: ctx.voiceChannelId,
      textChannelId: ctx.textChannelId,
      selfDeaf: true,
      volume: 100
    });
    await player.connect();
    ctx.player = player;
    return player;
  }

  async function createOrGetSession({ guildId, voiceChannelId, textChannelId, ownerId, defaultMode }) {
    if (!manager) throw new Error("lavalink-not-ready");
    if (!guildId || !voiceChannelId) throw new Error("missing-session");
    if (!ownerId) throw new Error("missing-owner");

    const key = sessionKey(guildId, voiceChannelId);
    return withSessionLock(key, async () => {
      const existing = ctxBySession.get(key);
      if (existing) {
        if (existing.ownerId && existing.ownerId !== ownerId && existing.mode === "dj") {
          throw new Error("not-owner");
        }
        if (textChannelId) existing.textChannelId = textChannelId;
        existing.lastActive = Date.now();

        // Only /play cancels a pending stop timer.
        clearStopping(existing);

        // If player was destroyed (by destroySession), recreate.
        try {
          const p = existing.player;
          const looksDead = !p || typeof p.play !== "function" || typeof p.queue?.add !== "function";
          if (looksDead) await recreatePlayer(existing);
        } catch {
          await recreatePlayer(existing);
        }

        return existing;
      }

      const player = manager.createPlayer({
        guildId,
        voiceChannelId,
        textChannelId,
        selfDeaf: true,
        volume: 100
      });

      await player.connect();

      const ctx = {
        player,
        guildId,
        voiceChannelId,
        textChannelId,
        ownerId,
        mode: String(defaultMode ?? "open").toLowerCase() === "dj" ? "dj" : "open",
        lastActive: Date.now(),
        __stopping: false,
        __destroyAt: null,
        __destroyTimer: null
      };

      ctxBySession.set(key, ctx);
      return ctx;
    });
  }

  function getSession(guildId, voiceChannelId) {
    return ctxBySession.get(sessionKey(guildId, voiceChannelId)) ?? null;
  }

  function getAnySessionInGuildForAgent(guildId) {
    for (const ctx of ctxBySession.values()) {
      if (ctx.guildId === guildId) return ctx;
    }
    return null;
  }

  async function search(ctx, query, requester) {
    const identifier = normalizeSearchQuery(query);
    if (!identifier) return { tracks: [] };
    if (typeof ctx?.player?.search !== "function") throw new Error("player-search-missing");
    return ctx.player.search({ query: identifier }, requester);
  }

  // FIX: decide "playing vs queued" using pre-existing session state, not `player.playing` alone.
  // Lavalink-client can transiently report `playing=false` even while a current track exists.
  async function enqueueAndPlay(ctx, track) {
    return withCtxLock(ctx, async () => {
      ctx.lastActive = Date.now();

      // /play cancels stopping and revives the session
      clearStopping(ctx);

      // If player died, recreate
      try {
        const p = ctx.player;
        const looksDead = !p || typeof p.play !== "function" || typeof p.queue?.add !== "function";
        if (looksDead) await recreatePlayer(ctx);
      } catch {
        await recreatePlayer(ctx);
      }

      const player = ctx.player;

      // Snapshot BEFORE mutating queue
      const hadCurrent = Boolean(getCurrent(player));
      const hadUpcoming = getQueueTracks(player).length > 0;
      const hadPlaying = Boolean(player.playing);
      const hadPaused = Boolean(player.paused);

      await player.queue.add(track);

      const shouldAutoStart = !(hadCurrent || hadUpcoming || hadPlaying || hadPaused);

      if (shouldAutoStart) {
        // Only when truly idle do we force resume+play.
        try {
          if (typeof player.pause === "function") await Promise.resolve(player.pause(false));
        } catch {}

        await player.play();
        return { action: "playing" };
      }

      // Session already has state; this is an enqueue.
      return { action: "queued" };
    });
  }

  function skip(ctx, actorUserId, requireOwnerMode = false) {
    return withCtxLock(ctx, async () => {
      if (requireOwnerMode) assertOwner(ctx, actorUserId);
      ctx.lastActive = Date.now();

      if (ctx.__stopping) {
        return { ok: true, action: "stopping", disconnectInMs: stoppingRemainingMs(ctx) };
      }

      const player = ctx.player;
      const current = getCurrent(player);
      const upcoming = getQueueTracks(player);

      if (!current && upcoming.length === 0) return { ok: true, action: "nothing-to-skip" };

      if (upcoming.length > 0 && typeof player.skip === "function") {
        try {
          await Promise.resolve(player.skip());
        } catch {}
        return { ok: true, action: "skipped" };
      }

      // End of queue: stop audio now, leave later.
      await softStopPlayback(player);
      markStopping(ctx, STOP_GRACE_MS);
      return { ok: true, action: "stopped", disconnectInMs: STOP_GRACE_MS };
    });
  }

  function pause(ctx, actorUserId, state, requireOwnerMode = false) {
    return withCtxLock(ctx, async () => {
      if (requireOwnerMode) assertOwner(ctx, actorUserId);
      ctx.lastActive = Date.now();

      if (ctx.__stopping) {
        return { ok: true, action: "stopping", disconnectInMs: stoppingRemainingMs(ctx) };
      }

      const player = ctx.player;

      const paused = Boolean(player.paused);
      const playing = Boolean(player.playing);
      const current = getCurrent(player);

      if (state === true) {
        if (!current && !playing) return { ok: true, action: "nothing-playing" };
        if (paused && !playing) return { ok: true, action: "already-paused" };

        const res = await safePause(player, true);
        if (!res.ok) throw new Error(res.error || "pause-failed");
        return { ok: true, action: res.action ?? "paused" };
      }

      // resume
      if (!current && !playing && !paused) return { ok: true, action: "nothing-playing" };
      if (!paused && playing) return { ok: true, action: "already-playing" };

      const res = await safePause(player, false);
      if (!res.ok) throw new Error(res.error || "resume-failed");
      return { ok: true, action: res.action ?? "resumed" };
    });
  }

  function destroySession(guildId, voiceChannelId) {
    const key = sessionKey(guildId, voiceChannelId);
    const ctx = ctxBySession.get(key);
    if (!ctx) return;

    clearStopping(ctx);

    try {
      if (typeof ctx.player?.destroy === "function") ctx.player.destroy();
    } catch {}

    ctxBySession.delete(key);
  }

  function stop(ctx, actorUserId, requireOwnerMode = false) {
    return withCtxLock(ctx, async () => {
      if (requireOwnerMode) assertOwner(ctx, actorUserId);
      ctx.lastActive = Date.now();

      if (ctx.__stopping) {
        return { ok: true, action: "stopping", disconnectInMs: stoppingRemainingMs(ctx) };
      }

      await softStopPlayback(ctx.player);
      markStopping(ctx, STOP_GRACE_MS);
      return { ok: true, action: "stopped", disconnectInMs: STOP_GRACE_MS };
    });
  }

  function destroyAllSessionsInGuild(guildId) {
    const keys = [];
    for (const [k, ctx] of ctxBySession.entries()) {
      if (ctx.guildId === guildId) keys.push(k);
    }
    for (const k of keys) {
      const [g, v] = String(k).split(":");
      if (g && v) destroySession(g, v);
    }
  }

  function setMode(ctx, actorUserId, mode) {
    return withCtxLock(ctx, async () => {
      ctx.lastActive = Date.now();
      const m = String(mode ?? "").toLowerCase() === "open" ? "open" : "dj";
      if (m === "dj") ctx.ownerId = actorUserId;
      ctx.mode = m;
      return { ok: true, action: "mode-set", mode: ctx.mode, ownerId: ctx.ownerId ?? null };
    });
  }

  return {
    start,
    createOrGetSession,
    getSession,
    getAnySessionInGuildForAgent,
    search,
    enqueueAndPlay,
    skip,
    pause,
    stop,
    destroySession,
    destroyAllSessionsInGuild,
    setMode
  };
}
