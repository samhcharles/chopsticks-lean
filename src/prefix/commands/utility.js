import { EmbedBuilder, PermissionsBitField } from "discord.js";
import { reply } from "../helpers.js";

export default [
  {
    name: "ping",
    aliases: ["latency", "ms"],
    description: "Show bot latency",
    rateLimit: 5000,
    async execute(message) {
      const latency = Math.round(message.client.ws.ping);
      const color = latency < 100 ? 0x57F287 : latency < 250 ? 0xFEE75C : 0xED4245;
      const embed = new EmbedBuilder()
        .setTitle("🏓 Pong!")
        .addFields({ name: "📡 API Latency", value: `${latency}ms`, inline: true })
        .setColor(color)
        .setFooter({ text: "Chopsticks • !ping" });
      await message.reply({ embeds: [embed] });
    }
  },
  {
    name: "uptime",
    aliases: ["up"],
    description: "Bot uptime",
    rateLimit: 5000,
    async execute(message) {
      const upSec = Math.floor(process.uptime());
      const d = Math.floor(upSec / 86400);
      const h = Math.floor((upSec % 86400) / 3600);
      const m = Math.floor((upSec % 3600) / 60);
      const s = upSec % 60;
      const parts = [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean);
      const embed = new EmbedBuilder()
        .setTitle("⏱️ Uptime")
        .setDescription(`**${parts.join(" ")}**`)
        .setColor(0x5865F2)
        .setFooter({ text: "Chopsticks • !uptime" });
      await message.reply({ embeds: [embed] });
    }
  },
  {
    name: "help",
    aliases: ["h", "commands", "cmds"],
    description: "List prefix commands — !help [category|command]",
    rateLimit: 3000,
    async execute(message, args, ctx) {
      const query = args[0]?.toLowerCase();
      if (!query) {
        const names = Array.from(ctx.commands.keys()).sort();
        const embed = new EmbedBuilder()
          .setTitle("📖 Prefix Commands")
          .setDescription(`Use \`${ctx.prefix}help <command>\` for details.\n\n\`\`\`${names.map(n => ctx.prefix + n).join("  ")}\`\`\``)
          .setColor(0x5865F2)
          .setFooter({ text: `${names.length} commands • Chopsticks` });
        return message.reply({ embeds: [embed] });
      }
      const cmd = ctx.commands.get(query);
      if (cmd) {
        const embed = new EmbedBuilder()
          .setTitle(`${ctx.prefix}${cmd.name}`)
          .setDescription(cmd.description || "No description.")
          .setColor(0x5865F2)
          .addFields(
            cmd.aliases?.length ? { name: "Aliases", value: cmd.aliases.map(a => `\`${ctx.prefix}${a}\``).join(", "), inline: true } : null,
            cmd.rateLimit ? { name: "Cooldown", value: `${cmd.rateLimit / 1000}s`, inline: true } : null,
          ).filter(Boolean);
        return message.reply({ embeds: [embed] });
      }
      return reply(message, `❌ No command named \`${query}\`.`);
    }
  },
  {
    name: "echo",
    aliases: ["say"],
    description: "Echo text back",
    rateLimit: 2000,
    async execute(message, args) {
      const text = args.join(" ").trim();
      await reply(message, text || "(empty)");
    }
  },
  {
    name: "choose",
    aliases: ["pick", "decide"],
    description: "Pick one option — !choose a, b, c OR !choose a|b|c",
    rateLimit: 2000,
    async execute(message, args) {
      const raw = args.join(" ");
      const items = raw.includes("|")
        ? raw.split("|").map(s => s.trim()).filter(Boolean)
        : raw.split(",").map(s => s.trim()).filter(Boolean);
      if (items.length < 2) return reply(message, "❌ Provide at least 2 options separated by `,` or `|`.");
      const pick = items[Math.floor(Math.random() * items.length)];
      const embed = new EmbedBuilder()
        .setTitle("🎯 I choose...")
        .setDescription(`**${pick}**`)
        .setColor(0xF0B232)
        .setFooter({ text: `From ${items.length} options • Chopsticks` });
      await message.reply({ embeds: [embed] });
    }
  },
  {
    name: "invite",
    aliases: ["addbot", "add"],
    description: "Get the bot invite link",
    rateLimit: 10000,
    async execute(message) {
      const perms = new PermissionsBitField([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageGuild,
        PermissionsBitField.Flags.ModerateMembers
      ]);
      const url = `https://discord.com/api/oauth2/authorize?client_id=${message.client.user.id}&permissions=${perms.bitfield}&scope=bot%20applications.commands`;
      const embed = new EmbedBuilder()
        .setTitle("🔗 Invite Chopsticks")
        .setDescription(`[**Click here to add Chopsticks to your server**](${url})`)
        .setColor(0x5865F2)
        .setFooter({ text: "Chopsticks by WokSpec" });
      await message.reply({ embeds: [embed] });
    }
  }
];
