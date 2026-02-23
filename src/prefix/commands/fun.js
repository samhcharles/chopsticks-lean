import { EmbedBuilder } from "discord.js";
import { reply, parseIntSafe } from "../helpers.js";
import { clampIntensity } from "../../fun/variants.js";
import {
  getFunCatalog,
  randomFunFromRuntime,
  renderFunFromRuntime,
  resolveVariantId
} from "../../fun/runtime.js";

// ── 8-ball answer set (matches /8ball slash command — 20 answers) ──────────
const ANSWERS = {
  positive: [
    "🟢 It is certain.",
    "🟢 It is decidedly so.",
    "🟢 Without a doubt.",
    "🟢 Yes, definitely.",
    "🟢 You may rely on it.",
    "🟢 As I see it, yes.",
    "🟢 Most likely.",
    "🟢 Outlook good.",
    "🟢 Yes.",
    "🟢 Signs point to yes.",
  ],
  neutral: [
    "🟡 Reply hazy, try again.",
    "🟡 Ask again later.",
    "🟡 Better not tell you now.",
    "🟡 Cannot predict now.",
    "🟡 Concentrate and ask again.",
  ],
  negative: [
    "🔴 Don't count on it.",
    "🔴 My reply is no.",
    "🔴 My sources say no.",
    "🔴 Outlook not so good.",
    "🔴 Very doubtful.",
  ],
};

const ANSWER_COLORS = { positive: 0x57F287, neutral: 0xFEE75C, negative: 0xED4245 };

function pick8BallAnswer() {
  const r = Math.random();
  const type = r < 0.5 ? "positive" : r < 0.75 ? "neutral" : "negative";
  const pool = ANSWERS[type];
  return { text: pool[Math.floor(Math.random() * pool.length)], type };
}

function parseFunIntensity(args) {
  let intensity = 3;
  const next = [];

  for (const token of args) {
    const match =
      /^--?intensity=(\d+)$/i.exec(token) ||
      /^-i=(\d+)$/i.exec(token) ||
      /^(\d)$/.exec(token);
    if (match) {
      intensity = clampIntensity(Number(match[1]));
      continue;
    }
    next.push(token);
  }

  return { intensity, args: next };
}

export default [
  {
    name: "roll",
    aliases: ["dice", "r"],
    description: "Roll a die — !roll [sides] e.g. !roll 20",
    rateLimit: 2000,
    async execute(message, args) {
      const sides = parseIntSafe(args[0] || "6", 2, 100) || 6;
      const result = Math.floor(Math.random() * sides) + 1;
      const isMax = result === sides;
      const isMin = result === 1;
      const embed = new EmbedBuilder()
        .setTitle("🎲 Dice Roll")
        .setDescription(`**${result}** / ${sides}${isMax ? "  🔥 *Max roll!*" : isMin && sides > 2 ? "  💀 *Ouch.*" : ""}`)
        .setColor(isMax ? 0xF0B232 : isMin && sides > 2 ? 0xED4245 : 0x5865F2)
        .setFooter({ text: `d${sides}` });
      await message.reply({ embeds: [embed] });
    }
  },
  {
    name: "coinflip",
    aliases: ["cf", "flip", "coin"],
    description: "Flip a coin",
    rateLimit: 2000,
    async execute(message) {
      const heads = Math.random() < 0.5;
      const embed = new EmbedBuilder()
        .setTitle(heads ? "🪙 Heads!" : "🪙 Tails!")
        .setColor(heads ? 0xF0B232 : 0x99AAB5)
        .setFooter({ text: "Chopsticks • !coinflip" });
      await message.reply({ embeds: [embed] });
    }
  },
  {
    name: "8ball",
    aliases: ["8b", "magic", "eightball"],
    description: "Ask the magic 8-ball — !8ball <question>",
    rateLimit: 3000,
    async execute(message, args) {
      const question = args.join(" ").trim();
      const { text, type } = pick8BallAnswer();
      const embed = new EmbedBuilder()
        .setTitle("🎱 Magic 8-Ball")
        .setDescription(question ? `**Q:** ${question}\n\n${text}` : text)
        .setColor(ANSWER_COLORS[type])
        .setFooter({ text: "The 8-ball has spoken." });
      await message.reply({ embeds: [embed] });
    }
  },
  {
    name: "fun",
    description: "Run fun variants (220 total)",
    rateLimit: 5000,
    async execute(message, args) {
      const { intensity, args: normalizedArgs } = parseFunIntensity(args);
      const sub = (normalizedArgs[0] || "random").toLowerCase();

      if (sub === "list" || sub === "catalog") {
        const query = normalizedArgs.slice(1).join(" ");
        const payload = await getFunCatalog({ query, limit: 20 });
        const stats = payload?.stats || { total: payload?.total || 0, themes: "?", styles: "?" };
        const hits = Array.isArray(payload?.matches) ? payload.matches : [];
        const head = `Fun variants: ${stats.total} (${stats.themes} themes x ${stats.styles} styles)`;
        const source = payload?.source ? ` [${payload.source}]` : "";
        if (!hits.length) return reply(message, `${head}\nNo variants found for query: ${query || "(empty)"}`);
        const lines = hits.map(v => `${v.id} -> ${v.label}`);
        return reply(message, `${head}${source}\n${lines.join("\n")}`.slice(0, 1900));
      }

      let target = "";
      let result = null;
      if (sub === "random" || sub === "r") {
        target = normalizedArgs.slice(1).join(" ");
        result = await randomFunFromRuntime({
          actorTag: message.author.username,
          target: target || message.author.username,
          intensity
        });
      } else {
        const variantId = resolveVariantId(sub);
        if (!variantId) {
          return reply(message, "Unknown fun variant. Use `fun list` to browse ids.");
        }
        target = normalizedArgs.slice(1).join(" ");
        result = await renderFunFromRuntime({
          variantId,
          actorTag: message.author.username,
          target: target || message.author.username,
          intensity
        });
      }

      if (!result.ok) return reply(message, "Unable to render variant.");
      const source = result.source ? ` [${result.source}]` : "";
      return reply(message, `${result.text}\n${result.metaLine}${source}`);
    }
  }
];
