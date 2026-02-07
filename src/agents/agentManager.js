// src/agents/agentManager.js
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

function sessionKey(guildId, voiceChannelId) {
  return `${guildId}:${voiceChannelId}`;
}

export class AgentManager {
  constructor({ host, port }) {
    this.host = host || "127.0.0.1";
    this.port = Number(port) || 8787;

    this.started = false;
    this.wss = null;

    this.agents = new Map(); // agentId -> agent
    this.pending = new Map(); // requestId -> { resolve, reject, timeout }
    this.sessions = new Map(); // sessionKey -> agentId

    // Hardening: fair selection per guild
    this.guildCursors = new Map(); // guildId -> last selected index
  }

  async start() {
    if (this.started) return;
    this.started = true;

    this.wss = new WebSocketServer({ host: this.host, port: this.port });
    this.wss.on("connection", ws => this.handleConnection(ws));
    this.wss.on("error", err => {
      console.error("[agent:control:server:error]", err?.message ?? err);
    });

    await new Promise(resolve => {
      this.wss.once("listening", resolve);
    });
  }

  handleConnection(ws) {
    ws.on("message", data => this.handleMessage(ws, data));
    ws.on("close", () => this.handleClose(ws));
    ws.on("error", () => {});
  }

  handleClose(ws) {
    const agentId = ws.__agentId;
    if (!agentId) return;

    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.ready = false;
    agent.client = null;
    agent.ws = null;

    for (const [k, aId] of this.sessions.entries()) {
      if (aId === agentId) this.sessions.delete(k);
    }

    agent.busyKey = null;
    agent.guildId = null;
    agent.voiceChannelId = null;
    agent.textChannelId = null;
    agent.ownerUserId = null;
  }

  handleMessage(ws, data) {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }

    if (msg?.type === "hello") return void this.handleHello(ws, msg);
    if (msg?.type === "guilds") return void this.handleGuilds(ws, msg);
    if (msg?.type === "event") return void this.handleEvent(ws, msg);
    if (msg?.type === "resp") return void this.handleResponse(ws, msg);
  }

  handleHello(ws, msg) {
    const agentId = String(msg?.agentId ?? "").trim();
    if (!agentId) return;

    const existing = this.agents.get(agentId);
    if (existing?.ws && existing.ws !== ws) {
      try {
        existing.ws.terminate();
      } catch {}
    }

    const agent = existing ?? {
      agentId,
      client: null,
      ws: null,
      ready: false,
      busyKey: null,
      guildIds: new Set(),
      guildId: null,
      voiceChannelId: null,
      textChannelId: null,
      ownerUserId: null,
      lastActive: null
    };

    agent.client = ws;
    agent.ws = ws;
    agent.ready = Boolean(msg?.ready);
    agent.guildIds = new Set(Array.isArray(msg?.guildIds) ? msg.guildIds : []);

    ws.__agentId = agentId;
    this.agents.set(agentId, agent);
  }

  handleGuilds(ws, msg) {
    const agentId = ws.__agentId;
    if (!agentId) return;

    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.guildIds = new Set(Array.isArray(msg?.guildIds) ? msg.guildIds : []);
  }

  handleEvent(ws, msg) {
    const agentId = ws.__agentId;
    if (!agentId) return;

    if (msg?.event === "released") {
      const guildId = msg?.guildId;
      const voiceChannelId = msg?.voiceChannelId;
      if (!guildId || !voiceChannelId) return;

      const key = sessionKey(guildId, voiceChannelId);
      const currentAgentId = this.sessions.get(key);
      if (currentAgentId !== agentId) return;

      this.releaseSession(guildId, voiceChannelId);
    }
  }

  handleResponse(ws, msg) {
    const reqId = msg?.id;
    if (!reqId) return;

    const pending = this.pending.get(reqId);
    if (!pending) return;

    this.pending.delete(reqId);
    clearTimeout(pending.timeout);

    if (msg?.ok) {
      pending.resolve(msg?.data ?? null);
    } else {
      const err = new Error(String(msg?.error ?? "command-failed"));
      pending.reject(err);
    }
  }

  getSessionAgent(guildId, voiceChannelId) {
    const key = sessionKey(guildId, voiceChannelId);
    const agentId = this.sessions.get(key);
    if (!agentId) return { ok: false, reason: "no-session" };

    const agent = this.agents.get(agentId);
    if (!agent?.ready || !agent?.ws) {
      this.sessions.delete(key);
      agent && this.releaseAgent(agent);
      return { ok: false, reason: "session-stale" };
    }

    return { ok: true, agent };
  }

  ensureSessionAgent(guildId, voiceChannelId, { textChannelId, ownerUserId } = {}) {
    const existing = this.getSessionAgent(guildId, voiceChannelId);
    if (existing.ok) return existing;

    const idle = this.findIdleAgentInGuildRoundRobin(guildId);
    if (!idle) {
      const present = this.countPresentInGuild(guildId);
      if (present === 0) return { ok: false, reason: "no-agents-in-guild" };
      return { ok: false, reason: "no-free-agents" };
    }

    this.bindAgentToSession(idle, { guildId, voiceChannelId, textChannelId, ownerUserId });
    return { ok: true, agent: idle };
  }

  listIdleAgentsInGuild(guildId) {
    const out = [];
    for (const agent of this.agents.values()) {
      if (!agent.ready || !agent.ws) continue;
      if (agent.busyKey) continue;
      if (!agent.guildIds.has(guildId)) continue;
      out.push(agent);
    }
    // stable order: agentId string
    out.sort((a, b) => String(a.agentId).localeCompare(String(b.agentId)));
    return out;
  }

  findIdleAgentInGuildRoundRobin(guildId) {
    const list = this.listIdleAgentsInGuild(guildId);
    if (list.length === 0) return null;

    const prev = this.guildCursors.get(guildId) ?? -1;
    const nextIndex = (prev + 1) % list.length;
    this.guildCursors.set(guildId, nextIndex);

    return list[nextIndex];
  }

  countPresentInGuild(guildId) {
    let count = 0;
    for (const agent of this.agents.values()) {
      if (agent.guildIds.has(guildId)) count++;
    }
    return count;
  }

  bindAgentToSession(agent, { guildId, voiceChannelId, textChannelId, ownerUserId }) {
    const key = sessionKey(guildId, voiceChannelId);
    agent.busyKey = key;
    agent.guildId = guildId;
    agent.voiceChannelId = voiceChannelId;
    agent.textChannelId = textChannelId ?? null;
    agent.ownerUserId = ownerUserId ?? null;
    agent.lastActive = Date.now();

    this.sessions.set(key, agent.agentId);
  }

  releaseSession(guildId, voiceChannelId) {
    const key = sessionKey(guildId, voiceChannelId);
    const agentId = this.sessions.get(key);
    this.sessions.delete(key);

    const agent = agentId ? this.agents.get(agentId) : null;
    if (agent?.busyKey === key) this.releaseAgent(agent);
  }

  releaseAgent(agent) {
    agent.busyKey = null;
    agent.guildId = null;
    agent.voiceChannelId = null;
    agent.textChannelId = null;
    agent.ownerUserId = null;
    agent.lastActive = Date.now();
  }

  async request(agent, op, data, timeoutMs = 20_000) {
    if (!agent?.ws) throw new Error("agent-offline");
    if (!agent.ready) throw new Error("agent-offline");

    const id = randomUUID();
    const payload = { type: "req", id, op, data };
    agent.lastActive = Date.now();

    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("agent-timeout"));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
    });

    // Send after pending is registered to avoid races
    try {
      agent.ws.send(JSON.stringify(payload));
    } catch {
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(id);
      }
      throw new Error("agent-offline");
    }

    return response;
  }
}
