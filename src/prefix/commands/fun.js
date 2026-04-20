import { EmbedBuilder, Colors } from "discord.js";
import { reply, parseIntSafe } from "../helpers.js";
import { clampIntensity } from "../../fun/variants.js";
import {
  getFunCatalog,
  randomFunFromRuntime,
  renderFunFromRuntime,
  resolveVariantId
} from "../../fun/runtime.js";
import { createRequire } from "module";
import { httpRequest } from "../../utils/httpFetch.js";
import COLORS from "../../utils/colors.js";

const require = createRequire(import.meta.url);
const RIDDLES = require("../../fun/riddles.json");
const WYR_LIST = require("../../fun/wyr.json");

// ── Ship helpers ──────────────────────────────────────────────────────────────
const SHIP_FLAVOR = [
  [0,  19,  "💔 Not meant to be. At all. The universe said no."],
  [20, 39,  "😬 Rough start. Maybe as friends first?"],
  [40, 54,  "🙂 There's potential — work on communication."],
  [55, 69,  "😊 Pretty compatible! Things could go well."],
  [70, 84,  "💕 Strong chemistry! You two really click."],
  [85, 94,  "🔥 Power couple alert. Very high compatibility!"],
  [95, 100, "💍 PERFECT MATCH. Absolutely destined. A love story for the ages."],
];
function shipScore(idA, idB) {
  const [lo, hi] = [idA, idB].sort();
  let h = 5381;
  for (const c of `${lo}:${hi}`) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return h % 101;
}
function shipHearts(score) {
  const filled = Math.round(score / 10);
  return "❤️".repeat(filled) + "🖤".repeat(10 - filled);
}

// ── Truth or Dare prompts ─────────────────────────────────────────────────────
const TOD_PROMPTS = {
  truth: {
    mild: [
      "What's the most embarrassing song on your playlist?",
      "What's a weird habit you have that you don't tell people about?",
      "What's the last thing you Googled?",
      "What's the most childish thing you still do?",
      "Have you ever laughed so hard you snorted in public?",
      "What's a food you secretly hate but pretend to like?",
      "What's the most useless talent you have?",
      "What's the weirdest dream you've ever had?",
      "What's a movie everyone loves that you actually hate?",
    ],
    spicy: [
      "What's the most awkward thing that's happened to you on a first date?",
      "What's the pettiest reason you've ever unfollowed someone?",
      "Have you ever ghosted someone? Tell the story.",
      "What's something you've done that you'd never admit in public?",
      "Who in this server do you think has the worst music taste?",
    ],
  },
  dare: {
    mild: [
      "Send a voice message saying 'I love hot dogs' in the most dramatic voice possible.",
      "Change your nickname to something embarrassing for the next 10 minutes.",
      "Send the last GIF in your GIF history.",
      "Type the next message with your eyes closed.",
      "Share the most zoomed-in selfie you can take right now.",
    ],
    spicy: [
      "Send a 'thinking of you' message to the last person you texted.",
      "Post your most embarrassing photo from 3 years ago.",
      "Impersonate another server member for the next 3 messages.",
      "Rate everyone currently online in this server out of 10.",
    ],
  },
};

// ── Quote fallback bank ───────────────────────────────────────────────────────
const QUOTE_FALLBACK = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "Why do programmers prefer dark mode? Because light attracts bugs.", author: "Anonymous" },
  { text: "It's not a bug — it's an undocumented feature.", author: "Anonymous" },
  { text: "Code is like humor. When you have to explain it, it's bad.", author: "Cory House" },
];

// ── Meme subs + fallbacks ─────────────────────────────────────────────────────
const MEME_SUBS = ["dankmemes", "me_irl", "ProgrammerHumor", "memes", "funny"];
const MEME_FALLBACK = [
  { title: "This is fine 🔥", url: "https://i.imgur.com/c4jt321.png", sub: "r/me_irl" },
  { title: "Expanding Brain", url: "https://i.imgur.com/nlme6QT.png", sub: "r/dankmemes" },
  { title: "Distracted Boyfriend", url: "https://i.imgur.com/sq5NIpJ.jpg", sub: "r/memes" },
  { title: "Surprised Pikachu", url: "https://i.imgur.com/0tWugmM.png", sub: "r/me_irl" },
];
const memeChannelCooldown = new Map(); // channelId → timestamp

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
  },

  // ── Cycle P3: Slash-mirrored prefix fun pack ──────────────────────────────

  {
    name: "meme",
    aliases: ["m"],
    description: "Get a random meme — !meme [sub]",
    rateLimit: 5000,
    async execute(message, args) {
      const COOLDOWN_MS = 30_000;
      const key = message.channelId || "dm";
      const last = memeChannelCooldown.get(key) || 0;
      if (Date.now() - last < COOLDOWN_MS) {
        const rem = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
        return message.reply(`⏳ Meme cooldown! Wait **${rem}s** in this channel.`);
      }
      memeChannelCooldown.set(key, Date.now());
      const sub = args[0] || MEME_SUBS[Math.floor(Math.random() * MEME_SUBS.length)];
      let title, imageUrl, subName;
      try {
        const data = await fetch(`https://meme-api.com/gimme/${encodeURIComponent(sub)}`, {
          headers: { "User-Agent": "Chopsticks-Discord-Bot/1.5" },
          signal: AbortSignal.timeout(8_000),
        }).then(r => r.ok ? r.json() : null);
        if (data && !data.nsfw && data.url && data.title) {
          title = data.title; imageUrl = data.url;
          subName = data.subreddit ? `r/${data.subreddit}` : `r/${sub}`;
        }
      } catch {}
      if (!imageUrl) {
        const fb = MEME_FALLBACK[Math.floor(Math.random() * MEME_FALLBACK.length)];
        title = fb.title; imageUrl = fb.url; subName = fb.sub;
      }
      const embed = new EmbedBuilder()
        .setTitle(title || "Random Meme")
        .setImage(imageUrl)
        .setColor(COLORS.ECONOMY)
        .setFooter({ text: `${subName} • Chopsticks !meme` });
      await message.reply({ embeds: [embed] });
    }
  },

  {
    name: "wyr",
    aliases: ["wouldyourather", "either"],
    description: "Would you rather — !wyr",
    rateLimit: 3000,
    async execute(message) {
      const pair = WYR_LIST[Math.floor(Math.random() * WYR_LIST.length)];
      const embed = new EmbedBuilder()
        .setTitle("🤔 Would You Rather…")
        .setDescription(`**A)** ${pair[0]}\n\n**B)** ${pair[1]}`)
        .setColor(COLORS.FUN)
        .setFooter({ text: "React with 🅰️ or 🅱️ to vote! • Chopsticks !wyr" });
      const msg = await message.reply({ embeds: [embed] });
      await msg.react("🅰️").catch(() => {});
      await msg.react("🅱️").catch(() => {});
    }
  },

  {
    name: "tod",
    aliases: ["truthordare", "td"],
    description: "Truth or dare — !tod [truth|dare] [spicy]",
    rateLimit: 3000,
    async execute(message, args) {
      const typeArg = (args[0] || "random").toLowerCase();
      const intensity = args.includes("spicy") ? "spicy" : "mild";
      const type = typeArg === "truth" || typeArg === "dare"
        ? typeArg
        : Math.random() < 0.5 ? "truth" : "dare";
      const pool = TOD_PROMPTS[type][intensity];
      const prompt = pool[Math.floor(Math.random() * pool.length)];
      const isT = type === "truth";
      const embed = new EmbedBuilder()
        .setTitle(isT ? "🤔 Truth!" : "💪 Dare!")
        .setDescription(prompt)
        .setColor(isT ? 0x5865F2 : 0xED4245)
        .setFooter({ text: `${intensity} • Chopsticks !tod` });
      await message.reply({ embeds: [embed] });
    }
  },

  {
    name: "ship",
    aliases: ["compatibility", "love"],
    description: "Ship two users — !ship @user1 [@user2]",
    rateLimit: 3000,
    async execute(message, args) {
      const mentioned = message.mentions.users;
      const user1 = mentioned.first() || message.author;
      const user2 = mentioned.size > 1 ? mentioned.at(1) : (mentioned.size === 1 ? message.author : null);
      if (!user2 || user1.id === user2.id) {
        return message.reply("💘 Usage: `!ship @user1 @user2` — ship two different users!");
      }
      const score = shipScore(user1.id, user2.id);
      const [,, flavor] = SHIP_FLAVOR.find(([min, max]) => score >= min && score <= max);
      const bar = `${shipHearts(score)} **${score}%**`;
      const embed = new EmbedBuilder()
        .setTitle("💘 Ship-O-Meter")
        .setColor(score >= 70 ? Colors.Pink : score >= 40 ? Colors.Yellow : Colors.DarkRed)
        .setDescription(`**${user1.username}** 💞 **${user2.username}**\n\n${bar}\n\n${flavor}`)
        .setFooter({ text: "Science™ certified • Chopsticks !ship" });
      await message.reply({ embeds: [embed] });
    }
  },

  {
    name: "quote",
    aliases: ["q", "inspire"],
    description: "Random quote — !quote [funny|programming]",
    rateLimit: 4000,
    async execute(message, args) {
      const typeArg = (args[0] || "inspire").toLowerCase();
      let quoteText = null, author = null;
      if (typeArg === "inspire" || typeArg === "i") {
        try {
          const data = await httpRequest("quote", "https://zenquotes.io/api/random", {
            method: "GET", headers: { "User-Agent": "Chopsticks-Discord-Bot/1.5" },
          });
          if (Array.isArray(data) && data[0]?.q) {
            quoteText = data[0].q; author = data[0].a;
          }
        } catch {}
      }
      if (!quoteText) {
        const fb = QUOTE_FALLBACK[Math.floor(Math.random() * QUOTE_FALLBACK.length)];
        quoteText = fb.text; author = fb.author;
      }
      const embed = new EmbedBuilder()
        .setTitle("💬 Quote")
        .setDescription(`*"${quoteText}"*\n\n— **${author}**`)
        .setColor(COLORS.ECONOMY)
        .setFooter({ text: "Chopsticks !quote" });
      await message.reply({ embeds: [embed] });
    }
  },

  {
    name: "riddle",
    aliases: ["brain", "puzzle"],
    description: "Random riddle — !riddle [reveal]",
    rateLimit: 3000,
    async execute(message, args) {
      const riddle = RIDDLES[Math.floor(Math.random() * RIDDLES.length)];
      const reveal = args[0]?.toLowerCase() === "reveal";
      const answerText = reveal ? `**Answer:** ${riddle.a}` : `**Answer:** ||${riddle.a}||`;
      const embed = new EmbedBuilder()
        .setTitle("🧩 Riddle Me This…")
        .setColor(COLORS.KNOWLEDGE)
        .setDescription(`${riddle.q}\n\n${answerText}`)
        .setFooter({ text: reveal ? "Answer revealed!" : "Click the spoiler to reveal • Chopsticks !riddle" });
      await message.reply({ embeds: [embed] });
    }
  },
];
