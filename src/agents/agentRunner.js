// src/agents/agentRunner.js
import "dotenv/config";
import { Client, GatewayIntentBits, Partials, Events, PermissionsBitField } from "discord.js";
import WebSocket from "ws";
import { readAgentTokensFromEnv } from "./env.js";
import { createAgentLavalink } from "../lavalink/agentLavalink.js";

const CONTROL_HOST = process.env.AGENT_CONTROL_HOST || "127.0.0.1";
const CONTROL_PORT = Number(process.env.AGENT_CONTROL_PORT) || 8787;
const CONTROL_URL = process.env.AGENT_CONTROL_URL || `ws://${CONTROL_HOST}:${CONTROL_PORT}`;

function agentIdFromIndex(i) {
  const slot = String(i + 1).padStart(4, "0");
  return `agent${slot}`;
}

function safeJsonParse(input) {
  try {
    return JSON.parse(String(input));
  } catch {
    return null;
  }
}

function getHumanCount(channel) {
  if (!channel?.members) return 0;
  let count = 0;
  for (const member of channel.members.values()) {
    if (!member?.user?.bot) count++;
  }
  return count;
}

function serializeTrack(track) {
  if (!track) return null;
  const info = track.info ?? {};
  return {
    title: info.title ?? "Unknown title",
    uri: info.uri ?? null,
    author: info.author ?? null,
    length: info.length ?? null,
    sourceName: info.sourceName ?? null
  };
}

function getQueueTracks(queue) {
  if (!queue) return [];
  if (Array.isArray(queue.tracks)) return queue.tracks;
  if (Array.isArray(queue)) return queue;
  if (Array.isArray(queue.items)) return queue.items;
  return [];
}

async function startAgent(token, index) {
  const agentId = agentIdFromIndex(index);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    partials: [Partials.Channel]
  });

  let lavalink = null;
  let ws = null;
  let wsReady = false;

  function sendWs(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function sendHello() {
    sendWs({
      type: "hello",
      agentId,
      ready: Boolean(lavalink),
      guildIds: Array.from(client.guilds.cache.keys())
    });
  }

  function sendGuilds() {
    sendWs({
      type: "guilds",
      guildIds: Array.from(client.guilds.cache.keys())
    });
  }

  function sendRelease(guildId, voiceChannelId, reason) {
    sendWs({
      type: "event",
      event: "released",
      agentId,
      guildId,
      voiceChannelId,
      reason: reason ?? "unknown"
    });
  }

  function connectControl() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(CONTROL_URL);
    wsReady = false;

    ws.on("open", () => {
      wsReady = true;
      sendHello();
    });

    // NEVER let exceptions escape this handler.
    ws.on("message", data => {
      void (async () => {
        const msg = safeJsonParse(data);
        if (!msg || msg.type !== "req") return;

        const { id, op, data: payload } = msg;
        if (!id || !op) return;

        try {
          const result = await handleRequest(op, payload);
          sendWs({ type: "resp", id, ok: true, data: result ?? null });
        } catch (err) {
          sendWs({
            type: "resp",
            id,
            ok: false,
            error: String(err?.message ?? err)
          });
        }
      })().catch(err => {
        console.error("[agent:ws:message:fatal]", err?.message ?? err);
      });
    });

    ws.on("close", () => {
      wsReady = false;
      setTimeout(connectControl, 2000);
    });

    ws.on("error", () => {});
  }

  async function ensureLavalink() {
    if (lavalink) return lavalink;
    try {
      lavalink = createAgentLavalink(client);
      await lavalink.start();
      return lavalink;
    } catch (err) {
      lavalink = null;
      throw err;
    }
  }

  async function fetchMember(guildId, userId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;
    const cached = guild.members.cache.get(userId);
    if (cached) return cached;
    return guild.members.fetch(userId).catch(() => null);
  }

  async function assertActorInVoice(guildId, voiceChannelId, actorUserId) {
    if (!actorUserId) throw new Error("missing-actor");
    const m = await fetchMember(guildId, actorUserId);
    if (!m) throw new Error("not-in-guild");
    const chId = m.voice?.channelId ?? null;
    if (chId !== voiceChannelId) throw new Error("not-in-voice");
    return m;
  }

  function isAdmin(member) {
    const perms = member?.permissions;
    if (!perms) return false;
    return (
      perms.has(PermissionsBitField.Flags.Administrator) ||
      perms.has(PermissionsBitField.Flags.ManageGuild) ||
      perms.has(PermissionsBitField.Flags.ManageChannels)
    );
  }

  function scheduleRelease(guildId, voiceChannelId, reason, disconnectInMs) {
    const ms = Number(disconnectInMs);
    if (!Number.isFinite(ms) || ms <= 0) return;

    setTimeout(() => {
      try {
        sendRelease(guildId, voiceChannelId, reason);
      } catch {}
    }, ms + 150);
  }

  async function handleRequest(op, payload = {}) {
    const guildId = payload.guildId;
    const voiceChannelId = payload.voiceChannelId;
    const textChannelId = payload.textChannelId;
    const actorUserId = payload.actorUserId ?? payload.ownerUserId ?? null;

    if (!guildId || !voiceChannelId) throw new Error("missing-session");

    const mgr = await ensureLavalink();

    // every op requires actor to be in that voice channel
    const actorMember = await assertActorInVoice(guildId, voiceChannelId, actorUserId);

    if (op === "play") {
      const defaultMode = String(payload.defaultMode ?? "open").toLowerCase() === "dj" ? "dj" : "open";

      const ctx = await mgr.createOrGetSession({
        guildId,
        voiceChannelId,
        textChannelId,
        ownerId: actorUserId,
        defaultMode
      });

      const query = payload.query;
      const requester = payload.requester ?? null;

      const res = await mgr.search(ctx, query, requester);
      if (!res?.tracks?.length) return { track: null, action: "none", mode: ctx.mode };

      const track = res.tracks[0];
      const playRes = await mgr.enqueueAndPlay(ctx, track);

      return {
        track: serializeTrack(track),
        action: playRes?.action ?? "queued",
        mode: ctx.mode,
        ownerId: ctx.ownerId ?? null
      };
    }

    const ctx = mgr.getSession(guildId, voiceChannelId);
    if (!ctx) throw new Error("no-session");

    const requireOwnerMode = ctx.mode === "dj";
    const actorIsAdmin = isAdmin(actorMember);

    if (op === "status") {
      const current = ctx.player?.queue?.current ?? null;
      const tracks = getQueueTracks(ctx.player?.queue);
      return {
        playing: Boolean(ctx.player?.playing),
        paused: Boolean(ctx.player?.paused),
        mode: ctx.mode,
        ownerId: ctx.ownerId ?? null,
        current: serializeTrack(current),
        queueLength: tracks.length
      };
    }

    if (op === "queue") {
      const current = ctx.player?.queue?.current ?? null;
      const tracks = getQueueTracks(ctx.player?.queue).map(serializeTrack);
      return { mode: ctx.mode, ownerId: ctx.ownerId ?? null, current: serializeTrack(current), tracks };
    }

    if (op === "setMode") {
      const mode = String(payload.mode ?? "open").toLowerCase() === "dj" ? "dj" : "open";

      if (mode === "dj") {
        if (ctx.ownerId && ctx.ownerId !== actorUserId && !actorIsAdmin) throw new Error("not-owner");
      }

      if (mode === "open") {
        if (ctx.mode === "dj" && ctx.ownerId && ctx.ownerId !== actorUserId && !actorIsAdmin) {
          throw new Error("not-owner");
        }
      }

      return mgr.setMode(ctx, actorUserId, mode);
    }

    if (op === "skip") {
      const r = await mgr.skip(ctx, actorUserId, requireOwnerMode && !actorIsAdmin);
      if (r?.action === "stopped" && Number(r.disconnectInMs) > 0) {
        scheduleRelease(guildId, voiceChannelId, "grace-expired", r.disconnectInMs);
      }
      return r;
    }

    if (op === "pause") return mgr.pause(ctx, actorUserId, true, requireOwnerMode && !actorIsAdmin);
    if (op === "resume") return mgr.pause(ctx, actorUserId, false, requireOwnerMode && !actorIsAdmin);

    if (op === "stop") {
      const r = await mgr.stop(ctx, actorUserId, requireOwnerMode && !actorIsAdmin);
      if (r?.action === "stopped" && Number(r.disconnectInMs) > 0) {
        scheduleRelease(guildId, voiceChannelId, "grace-expired", r.disconnectInMs);
      } else {
        sendRelease(guildId, voiceChannelId, "stop");
      }
      return r ?? { ok: true };
    }

    throw new Error("unknown-op");
  }

  async function stopIfEmpty(channel) {
    if (!channel || !lavalink) return;

    const humanCount = getHumanCount(channel);
    if (humanCount > 0) return;

    const ctx = lavalink.getSession(channel.guild.id, channel.id);
    if (!ctx) return;

    try {
      await lavalink.destroySession(channel.guild.id, channel.id);
      try {
        if (typeof ctx.player?.destroy === "function") ctx.player.destroy();
      } catch {}
    } catch {}

    sendRelease(channel.guild.id, channel.id, "empty-channel");
  }

  async function handleAgentMoved(oldState, newState) {
    if (!lavalink) return;

    const selfId = client.user?.id;
    if (!selfId) return;
    if (newState.id !== selfId && oldState.id !== selfId) return;

    const guildId = (newState.guild ?? oldState.guild)?.id;
    if (!guildId) return;

    const ctx = lavalink.getAnySessionInGuildForAgent(guildId);
    if (!ctx) return;

    const expectedVc = ctx.voiceChannelId;
    const actualVc = newState.channel?.id ?? null;

    if (actualVc !== expectedVc) {
      try {
        await lavalink.destroySession(ctx.guildId, ctx.voiceChannelId);
        try {
          if (typeof ctx.player?.destroy === "function") ctx.player.destroy();
        } catch {}
      } catch {}

      sendRelease(
        ctx.guildId,
        ctx.voiceChannelId,
        actualVc ? "agent-moved" : "agent-disconnected"
      );
    }
  }

  client.once(Events.ClientReady, async () => {
    console.log(`✅ Agent ready: ${client.user.tag} (${agentId})`);

    try {
      await ensureLavalink();
    } catch (err) {
      console.error(`[${agentId}] Lavalink init failed`, err?.message ?? err);
    }

    connectControl();
    if (wsReady) sendHello();
  });

  client.on("guildCreate", () => sendGuilds());
  client.on("guildDelete", () => sendGuilds());

  client.on("voiceStateUpdate", async (oldState, newState) => {
    const oldChannel = oldState.channel ?? null;
    const newChannel = newState.channel ?? null;

    await handleAgentMoved(oldState, newState);

    if (oldChannel && oldChannel.id !== newChannel?.id) {
      await stopIfEmpty(oldChannel);
    }
  });

  client.on("error", () => {});
  client.on("shardError", () => {});
  client.on("warn", () => {});

  await client.login(token);
}

const tokens = readAgentTokensFromEnv(process.env);
if (tokens.length === 0) throw new Error("No agent tokens configured");

for (let i = 0; i < tokens.length; i++) {
  startAgent(tokens[i], i).catch(err => {
    console.error(`[agent:${i + 1}] startup failed`, err?.message ?? err);
  });
}
