import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from "discord.js";

import { Colors, replyError } from "../utils/discordOutput.js";
import { pickTriviaQuestion, listTriviaCategories } from "../game/trivia/bank.js";
import { makeTriviaSessionId, shuffleChoices, pickAgentAnswer, agentDelayRangeMs, computeReward, formatDifficulty } from "../game/trivia/engine.js";
import { pickDmIntro, pickAgentThinkingLine, pickAgentResultLine } from "../game/trivia/narration.js";
import {
  getActiveTriviaSessionId,
  setActiveTriviaSessionId,
  clearActiveTriviaSessionId,
  loadTriviaSession,
  saveTriviaSession,
  deleteTriviaSession
} from "../game/trivia/session.js";
import { addCredits } from "../economy/wallet.js";
import { addGameXp } from "../game/profile.js";
import { recordQuestEvent } from "../game/quests.js";

const SESSION_TTL_SECONDS = 15 * 60;
const QUESTION_TIME_LIMIT_MS = 30_000;
const LOBBY_TIMEOUT_MS = 2 * 60 * 1000;
const COUNTDOWN_SECONDS = 3;
const AGENT_MIN_THINK_MS = 3_000;

function formatAgentTextError(reasonOrErr) {
  const msg = String(reasonOrErr?.message ?? reasonOrErr);
  if (msg === "no-agents-in-guild") {
    return "❌ No agents deployed in this guild.\n💡 Fix: `/agents deploy 5`";
  }
  if (msg === "no-free-agents") {
    return "⏳ All agents are currently busy.\n💡 Try again in a few seconds or deploy more agents with `/agents deploy <count>`.";
  }
  if (msg === "agents-not-ready") return "⏳ Agents are starting up. Try again in 10-15 seconds.";
  if (msg === "agent-offline") return "❌ Agent disconnected. Try again.";
  if (msg === "agent-timeout") return "⏱️ Agent timed out. Try again.";
  return "❌ Trivia failed.";
}

function buildQuestionEmbed({ session, agentTag }) {
  const letters = ["A", "B", "C", "D", "E", "F"];
  const lines = session.choices.map((c, idx) => `**${letters[idx]}.** ${c}`);
  const yourPick = Number.isFinite(Number(session.userPick)) ? letters[Number(session.userPick)] : null;
  const agentPick = Number.isFinite(Number(session.agentPick)) ? letters[Number(session.agentPick)] : null;
  const locked = Boolean(session.userLockedAt);

  const e = new EmbedBuilder()
    .setTitle("🧩 Trivia Duel")
    .setColor(Colors.INFO)
    .setDescription(pickDmIntro())
    .addFields(
      { name: "Category", value: String(session.category || "Any"), inline: true },
      { name: "Opponent", value: `${agentTag}`, inline: true },
      { name: "Difficulty", value: formatDifficulty(session.difficulty), inline: true },
      { name: "Question", value: String(session.prompt || "…"), inline: false },
      { name: "Choices", value: lines.join("\n").slice(0, 1024), inline: false }
    )
    .setFooter({ text: locked ? "Locked in. Waiting for the opponent…" : "Pick an answer, then Lock In." })
    .setTimestamp();

  if (yourPick || agentPick) {
    e.addFields({
      name: "Picks",
      value: [
        yourPick ? `You: **${yourPick}**` : "You: _not locked_",
        agentPick ? `${agentTag}: **${agentPick}**` : `${agentTag}: _thinking_`
      ].join("\n"),
      inline: false
    });
  }

  return e;
}

function buildAnswerComponents(sessionId, { disabled = false } = {}) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`trivia:sel:${sessionId}`)
    .setPlaceholder("Choose your answer…")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(Boolean(disabled))
    .addOptions(
      { label: "A", value: "0" },
      { label: "B", value: "1" },
      { label: "C", value: "2" },
      { label: "D", value: "3" }
    );

  const row1 = new ActionRowBuilder().addComponents(menu);

  const lockBtn = new ButtonBuilder()
    .setCustomId(`trivia:btn:${sessionId}:lock`)
    .setLabel("Lock In")
    .setStyle(ButtonStyle.Success)
    .setDisabled(Boolean(disabled));

  const forfeitBtn = new ButtonBuilder()
    .setCustomId(`trivia:btn:${sessionId}:forfeit`)
    .setLabel("Forfeit")
    .setStyle(ButtonStyle.Danger);

  const row2 = new ActionRowBuilder().addComponents(lockBtn, forfeitBtn);
  return [row1, row2];
}

function buildLobbyEmbed(session) {
  const e = new EmbedBuilder()
    .setTitle("🧩 Trivia Duel: Ready Check")
    .setColor(Colors.INFO)
    .setDescription(
      `${pickDmIntro()}\n\n` +
      `**Opponent:** ${session.agentTag}\n` +
      `**Difficulty:** ${formatDifficulty(session.difficulty)}\n` +
      `**Category:** ${String(session.category || "Any")}\n\n` +
      `Press **Start** when you're ready.`
    )
    .setFooter({ text: "This lobby expires if you don't start." })
    .setTimestamp();
  return e;
}

function buildLobbyComponents(sessionId, { disabled = false } = {}) {
  const startBtn = new ButtonBuilder()
    .setCustomId(`trivia:btn:${sessionId}:start`)
    .setLabel("Start")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(Boolean(disabled));

  const rulesBtn = new ButtonBuilder()
    .setCustomId(`trivia:btn:${sessionId}:rules`)
    .setLabel("Rules")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(Boolean(disabled));

  const forfeitBtn = new ButtonBuilder()
    .setCustomId(`trivia:btn:${sessionId}:forfeit`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(Boolean(disabled));

  return [new ActionRowBuilder().addComponents(startBtn, rulesBtn, forfeitBtn)];
}

async function sendViaAgent({ agent, guildId, channelId, actorUserId, content, embeds }) {
  const mgr = global.agentManager;
  if (!mgr) throw new Error("agents-not-ready");
  return await mgr.request(agent, "discordSend", {
    guildId,
    textChannelId: channelId,
    actorUserId,
    content,
    embeds
  });
}

async function getSessionMessage(client, session) {
  const channel = await client.channels.fetch(session.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return { channel: null, msg: null };
  const msg = session.messageId ? await channel.messages.fetch(session.messageId).catch(() => null) : null;
  return { channel, msg };
}

async function showQuestion(client, sessionId) {
  const session = await loadTriviaSession(sessionId);
  if (!session || session.endedAt) return false;

  // Reveal question (start timing here).
  const revealedAt = Date.now();
  session.stage = "question";
  session.revealedAt = revealedAt;
  session.expiresAt = revealedAt + QUESTION_TIME_LIMIT_MS;

  const [minDelay, maxDelay] = agentDelayRangeMs(session.difficulty);
  const rnd = Math.floor(minDelay + Math.random() * Math.max(1, (maxDelay - minDelay)));
  session.agentDueAt = revealedAt + Math.max(AGENT_MIN_THINK_MS, rnd);

  await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);

  const embed = buildQuestionEmbed({ session, agentTag: session.agentTag });
  const { msg } = await getSessionMessage(client, session);
  if (msg) {
    await msg.edit({ embeds: [embed], components: buildAnswerComponents(sessionId, { disabled: false }) }).catch(() => {});
  }

  // Best-effort: agent "thinking" line.
  try {
    const mgr = global.agentManager;
    const agent = mgr?.liveAgents?.get?.(session.agentId) || null;
    if (agent?.ready) {
      await sendViaAgent({
        agent,
        guildId: session.guildId,
        channelId: session.channelId,
        actorUserId: session.userId,
        content: pickAgentThinkingLine(session.agentTag)
      });
    }
  } catch {}

  // Schedule agent answer.
  setTimeout(() => {
    maybeRunAgentAnswer(client, sessionId).catch(() => {});
  }, Math.max(50, session.agentDueAt - Date.now()));

  // Schedule question timeout.
  setTimeout(() => {
    (async () => {
      const s = await loadTriviaSession(sessionId);
      if (!s || s.endedAt) return;
      if (!s.userLockedAt) {
        s.userLockedAt = Date.now();
        s.userPick = null;
        await saveTriviaSession(sessionId, s, SESSION_TTL_SECONDS);
      }
      await maybeRunAgentAnswer(client, sessionId);
      await finalizeSession(client, sessionId, { reason: "timeout" });
    })().catch(() => {});
  }, Math.max(1_000, session.expiresAt - Date.now() + 250));

  return true;
}

async function runCountdown(client, sessionId) {
  for (let i = COUNTDOWN_SECONDS; i >= 1; i -= 1) {
    const session = await loadTriviaSession(sessionId);
    if (!session || session.endedAt) return false;

    const e = new EmbedBuilder()
      .setTitle("⏳ Starting…")
      .setColor(Colors.INFO)
      .setDescription(`Question reveals in **${i}**…`)
      .addFields(
        { name: "Opponent", value: session.agentTag, inline: true },
        { name: "Difficulty", value: formatDifficulty(session.difficulty), inline: true },
        { name: "Category", value: String(session.category || "Any"), inline: true }
      )
      .setTimestamp();

    const { msg } = await getSessionMessage(client, session);
    if (msg) {
      await msg.edit({ embeds: [e], components: buildLobbyComponents(sessionId, { disabled: true }) }).catch(() => {});
    }

    await new Promise(r => setTimeout(r, 1000));
  }
  return true;
}

async function finalizeSession(client, sessionId, { reason = "completed" } = {}) {
  const session = await loadTriviaSession(sessionId);
  if (!session || session.endedAt) return false;

  const letters = ["A", "B", "C", "D", "E", "F"];
  const correct = session.correctIndex;
  const userPick = Number.isFinite(Number(session.userPick)) ? Number(session.userPick) : null;
  const agentPick = Number.isFinite(Number(session.agentPick)) ? Number(session.agentPick) : null;

  const userCorrect = userPick !== null && userPick === correct;
  const agentCorrect = agentPick !== null && agentPick === correct;

  let result = "tie";
  if (userCorrect && !agentCorrect) result = "win";
  else if (!userCorrect && agentCorrect) result = "lose";
  else if (userCorrect && agentCorrect) {
    const uAt = Number(session.userLockedAt || 0);
    const aAt = Number(session.agentLockedAt || 0);
    if (uAt && aAt) result = uAt < aAt ? "win" : uAt > aAt ? "lose" : "tie";
    else result = "tie";
  }

  const answeredBeforeAgent = Boolean(session.userLockedAt && session.agentLockedAt && session.userLockedAt < session.agentLockedAt);
  const reward = computeReward({ difficulty: session.difficulty, result, answeredBeforeAgent });

  // Apply rewards (best-effort, but do not fail final output).
  try {
    if (reward.credits > 0) await addCredits(session.userId, reward.credits, `Trivia (${session.difficulty}): ${result}`);
  } catch {}
  let xpRes = null;
  try {
    xpRes = await addGameXp(session.userId, reward.xp, { reason: `trivia:${result}` });
  } catch {}

  // Track quests (best-effort).
  try { await recordQuestEvent(session.userId, "trivia_runs", 1); } catch {}
  try { if (result === "win") await recordQuestEvent(session.userId, "trivia_wins", 1); } catch {}

  // Agents gain XP too (stored on the agent bot user ID, not the internal agentId).
  // No credits for agents.
  const agentUserId = String(session.agentUserId || "").trim();
  if (agentUserId) {
    const agentAnsweredBeforeUser = Boolean(session.userLockedAt && session.agentLockedAt && session.agentLockedAt < session.userLockedAt);
    const agentResult = result === "win" ? "lose" : result === "lose" ? "win" : "tie";
    const agentReward = computeReward({ difficulty: session.difficulty, result: agentResult, answeredBeforeAgent: agentAnsweredBeforeUser });
    try {
      await addGameXp(agentUserId, agentReward.xp, { reason: `trivia-agent:${agentResult}` });
    } catch {}
  }

  // Agent reaction line (best-effort, only for public duels).
  try {
    if (session.publicMode) {
      const mgr = global.agentManager;
      const agent = mgr?.liveAgents?.get?.(session.agentId) || null;
      if (agent?.ready) {
        await sendViaAgent({
          agent,
          guildId: session.guildId,
          channelId: session.channelId,
          actorUserId: session.userId,
          content: pickAgentResultLine({
            agentTag: session.agentTag,
            result: result === "win" ? "lose" : result === "lose" ? "win" : "tie",
            difficulty: session.difficulty
          })
        });
      }
    }
  } catch {}

  session.endedAt = Date.now();
  session.endReason = reason;
  await deleteTriviaSession(sessionId);
  await clearActiveTriviaSessionId({ guildId: session.guildId, channelId: session.channelId, userId: session.userId });

  // Release agent lease (best-effort).
  try {
    const mgr = global.agentManager;
    if (mgr) mgr.releaseTextSession(session.guildId, session.channelId, { ownerUserId: session.userId, kind: "trivia" });
  } catch {}

  const category = String(session.category || "Any");
  const agentTag = session.agentTag || `Agent ${session.agentId || ""}`.trim();

  const e = new EmbedBuilder()
    .setTitle("🧩 Trivia Results")
    .setColor(result === "win" ? Colors.SUCCESS : result === "lose" ? Colors.ERROR : Colors.INFO)
    .setDescription(
      result === "win" ? "You won the duel." : result === "lose" ? "You lost the duel." : "It's a tie."
    )
    .addFields(
      { name: "Category", value: category, inline: true },
      { name: "Difficulty", value: formatDifficulty(session.difficulty), inline: true },
      { name: "Correct", value: `**${letters[correct]}**`, inline: true },
      { name: "Your Pick", value: userPick === null ? "_none_" : `**${letters[userPick]}**`, inline: true },
      { name: `${agentTag} Pick`, value: agentPick === null ? "_none_" : `**${letters[agentPick]}**`, inline: true },
      { name: "Rewards", value: `+${reward.credits.toLocaleString()} Credits • +${reward.xp.toLocaleString()} XP`, inline: false }
    )
    .setTimestamp();

  if (session.explanation) {
    e.addFields({ name: "Why", value: String(session.explanation).slice(0, 400), inline: false });
  }
  if (xpRes?.granted?.length) {
    const crates = xpRes.granted.slice(0, 3).map(g => `Lv ${g.level}: \`${g.crateId}\``).join("\n");
    const more = xpRes.granted.length > 3 ? `\n...and ${xpRes.granted.length - 3} more.` : "";
    e.addFields({ name: "Level Rewards", value: crates + more, inline: false });
  }

  try {
    const { channel, msg } = await getSessionMessage(client, session);
    if (channel) {
      if (msg) await msg.edit({ embeds: [e], components: [] }).catch(() => {});
      else await channel.send({ embeds: [e] }).catch(() => {});
    }
  } catch {}

  return true;
}

async function maybeRunAgentAnswer(client, sessionId) {
  const session = await loadTriviaSession(sessionId);
  if (!session || session.endedAt) return;
  if (session.stage !== "question") return;
  if (session.agentPick !== null && session.agentPick !== undefined) return;

  const now = Date.now();
  const dueAt = Number(session.agentDueAt || 0);
  if (dueAt && now < dueAt) return;

  const agentPick = pickAgentAnswer({
    correctIndex: session.correctIndex,
    choicesLen: session.choices?.length || 4,
    difficulty: session.difficulty
  });
  session.agentPick = agentPick;
  session.agentLockedAt = now;
  await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);

  // Announce from the agent identity.
  try {
    if (!session.publicMode) throw new Error("private-mode");
    const mgr = global.agentManager;
    const agent = mgr?.liveAgents?.get?.(session.agentId) || null;
    if (mgr && agent?.ready) {
      const letters = ["A", "B", "C", "D"];
      const agentTag = session.agentTag || `Agent ${session.agentId || ""}`.trim();
      await sendViaAgent({
        agent,
        guildId: session.guildId,
        channelId: session.channelId,
        actorUserId: session.userId,
        content: `${agentTag} locks in: **${letters[agentPick] || "?"}**`
      });
    }
  } catch {}

  // If user already locked, finalize immediately.
  if (session.userLockedAt) {
    await finalizeSession(client, sessionId, { reason: "completed" });
  }
}

export const data = new SlashCommandBuilder()
  .setName("trivia")
  .setDescription("Play a trivia duel against a deployed agent")
  .addSubcommand(sub =>
    sub
      .setName("start")
      .setDescription("Start a trivia duel")
      .addStringOption(o =>
        o
          .setName("difficulty")
          .setDescription("Opponent difficulty (affects speed + accuracy)")
          .setRequired(false)
          .addChoices(
            { name: "Easy", value: "easy" },
            { name: "Normal", value: "normal" },
            { name: "Hard", value: "hard" },
            { name: "Nightmare", value: "nightmare" }
          )
      )
      .addStringOption(o =>
        o
          .setName("category")
          .setDescription("Question category")
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addBooleanOption(o =>
        o
          .setName("public")
          .setDescription("Post the duel publicly in this channel (default true)")
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("stop")
      .setDescription("Forfeit your current trivia duel in this channel")
  );

export default {
  data,
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused?.name !== "category") return await interaction.respond([]);
    const q = String(focused.value || "").toLowerCase();
    const opts = listTriviaCategories()
      .filter(c => c.toLowerCase().includes(q))
      .slice(0, 25)
      .map(c => ({ name: c, value: c }));
    await interaction.respond(opts);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    if (!guildId) {
      return await replyError(interaction, "Guild Only", "Trivia duels can only be played in a server.", true);
    }

    if (sub === "stop") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const active = await getActiveTriviaSessionId({ guildId, channelId, userId: interaction.user.id });
      if (!active) {
        return await replyError(interaction, "No Active Duel", "You have no active trivia duel in this channel.", true);
      }
      await finalizeSession(interaction.client, String(active), { reason: "forfeit" });
      return await interaction.editReply({ embeds: [new EmbedBuilder().setColor(Colors.SUCCESS).setTitle("Forfeited").setDescription("Your trivia duel has been ended.")] });
    }

    await interaction.deferReply();

    // Enforce single active duel per user per channel.
    const existing = await getActiveTriviaSessionId({ guildId, channelId, userId: interaction.user.id });
    if (existing) {
      const still = await loadTriviaSession(String(existing));
      if (still) {
        return await replyError(
          interaction,
          "Duel Already Running",
          "You already have an active trivia duel in this channel.\nUse `/trivia stop` to forfeit it.",
          true
        );
      }
    }

    const mgr = global.agentManager;
    if (!mgr) {
      return await replyError(interaction, "Agents Not Ready", formatAgentTextError("agents-not-ready"), true);
    }

    const difficulty = interaction.options.getString("difficulty") || "normal";
    const category = interaction.options.getString("category") || "Any";
    const isPublic = interaction.options.getBoolean("public");
    const publicMode = isPublic === null ? true : Boolean(isPublic);
    if (!publicMode) {
      return await replyError(
        interaction,
        "Not Supported Yet",
        "Private trivia duels are not supported yet.\nUse `/trivia start public:true` for now.",
        true
      );
    }

    const lease = await mgr.ensureTextSessionAgent(guildId, channelId, {
      ownerUserId: interaction.user.id,
      kind: "trivia"
    });
    if (!lease.ok) {
      return await replyError(interaction, "Trivia Error", formatAgentTextError(lease.reason), true);
    }

    const q = pickTriviaQuestion({ difficulty, category });
    if (!q) {
      mgr.releaseTextSession(guildId, channelId, { ownerUserId: interaction.user.id, kind: "trivia" });
      return await replyError(interaction, "No Questions", "No trivia questions are available for that filter.", true);
    }

    const { shuffled, correctIndex } = shuffleChoices(q.choices, q.answerIndex);
    const sessionId = makeTriviaSessionId();

    const agentTag = lease.agent.tag ? lease.agent.tag : `Agent ${lease.agent.agentId}`;
    const agentUserId = String(lease.agent.botUserId || "").trim() || null;

    const session = {
      sessionId,
      guildId,
      channelId,
      userId: interaction.user.id,
      difficulty,
      category: q.category,
      prompt: q.prompt,
      explanation: q.explanation || null,
      choices: shuffled.slice(0, 4),
      correctIndex,
      createdAt: Date.now(),
      stage: "lobby",
      expiresAt: null,
      agentDueAt: null,
      agentId: lease.agent.agentId,
      agentTag,
      agentUserId,
      agentPick: null,
      agentLockedAt: null,
      userPick: null,
      userLockedAt: null,
      messageId: null,
      agentLeaseKey: lease.key,
      publicMode: true
    };

    await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);
    await setActiveTriviaSessionId({ guildId, channelId, userId: interaction.user.id, sessionId, ttlSeconds: SESSION_TTL_SECONDS });

    const embed = buildLobbyEmbed(session);
    const components = buildLobbyComponents(sessionId, { disabled: false });

    const payload = {
      embeds: [embed],
      components,
      flags: publicMode ? undefined : MessageFlags.Ephemeral,
      fetchReply: true
    };

    const msg = await interaction.editReply(payload);
    session.messageId = msg?.id || null;
    await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);

    // Lobby timeout cleanup (no silent dead sessions).
    setTimeout(() => {
      (async () => {
        const s = await loadTriviaSession(sessionId);
        if (!s || s.endedAt) return;
        if (s.stage !== "lobby") return;
        await finalizeSession(interaction.client, sessionId, { reason: "lobby-timeout" });
      })().catch(() => {});
    }, LOBBY_TIMEOUT_MS);
  }
};

export async function handleSelect(interaction) {
  const id = String(interaction.customId || "");
  if (!id.startsWith("trivia:sel:")) return false;
  const sessionId = id.split(":").slice(2).join(":");
  const session = await loadTriviaSession(sessionId);
  if (!session) {
    await interaction.reply({ content: "This duel expired. Run `/trivia start` again.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.user.id !== session.userId) {
    await interaction.reply({ content: "This duel belongs to another user.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (session.stage !== "question") {
    await interaction.reply({ content: "Not ready yet. Press Start first.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (session.userLockedAt) {
    await interaction.reply({ content: "Already locked in.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const v = interaction.values?.[0];
  const pick = Math.max(0, Math.min(3, Math.trunc(Number(v))));
  session.userPick = pick;
  await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);

  const embed = buildQuestionEmbed({ session, agentTag: session.agentTag || "Agent" });
  await interaction.update({ embeds: [embed], components: buildAnswerComponents(sessionId, { disabled: false }) });
  return true;
}

export async function handleButton(interaction) {
  const id = String(interaction.customId || "");
  if (!id.startsWith("trivia:btn:")) return false;
  const parts = id.split(":");
  const sessionId = parts[2];
  const action = parts[3];

  const session = await loadTriviaSession(sessionId);
  if (!session) {
    await interaction.reply({ content: "This duel expired. Run `/trivia start` again.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.user.id !== session.userId) {
    await interaction.reply({ content: "This duel belongs to another user.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "rules") {
    await interaction.reply({
      content:
        "Rules:\n" +
        "- Press Start to begin.\n" +
        "- Pick A/B/C/D from the dropdown.\n" +
        "- Press Lock In to submit.\n" +
        "- Agent will never answer in under 3 seconds after reveal.\n" +
        "- You earn less XP for losing, more for winning.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (action === "start") {
    if (session.stage !== "lobby") {
      await interaction.reply({ content: "Already started.", flags: MessageFlags.Ephemeral });
      return true;
    }
    session.stage = "countdown";
    await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);

    await interaction.update({ embeds: [buildLobbyEmbed(session)], components: buildLobbyComponents(sessionId, { disabled: true }) });
    await runCountdown(interaction.client, sessionId);
    await showQuestion(interaction.client, sessionId);
    return true;
  }

  if (action === "forfeit") {
    await interaction.update({ embeds: [new EmbedBuilder().setColor(Colors.INFO).setTitle("Cancelled").setDescription("Ending duel…")], components: [] });
    await finalizeSession(interaction.client, sessionId, { reason: "forfeit" });
    return true;
  }

  if (action === "lock") {
    if (session.stage !== "question") {
      await interaction.reply({ content: "Press Start first.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (session.userLockedAt) {
      await interaction.reply({ content: "Already locked in.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (session.userPick === null || session.userPick === undefined) {
      await interaction.reply({ content: "Pick A/B/C/D first.", flags: MessageFlags.Ephemeral });
      return true;
    }
    session.userLockedAt = Date.now();
    await saveTriviaSession(sessionId, session, SESSION_TTL_SECONDS);

    const embed = buildQuestionEmbed({ session, agentTag: session.agentTag || "Agent" });
    await interaction.update({ embeds: [embed], components: buildAnswerComponents(sessionId, { disabled: true }) });

    // If agent already answered, finalize now. Otherwise finalize when agent answers.
    await maybeRunAgentAnswer(interaction.client, sessionId);
    const updated = await loadTriviaSession(sessionId);
    if (updated?.agentPick !== null && updated?.agentPick !== undefined) {
      await finalizeSession(interaction.client, sessionId, { reason: "completed" });
    }
    return true;
  }

  await interaction.reply({ content: "Unknown trivia action.", flags: MessageFlags.Ephemeral });
  return true;
}
