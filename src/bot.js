require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits: P
} = require("discord.js");
const { randomUUID } = require("node:crypto");
const commands = require("./command-definitions");
const { addWarning, getWarnings, removeWarning } = require("./store");
const { makeStreamAnnouncement } = require("./streams");
const {
  DEFAULT_TIMEZONE,
  parseLocalDateTime,
  scheduleStream,
  listSchedules,
  cancelSchedule,
  startScheduler
} = require("./scheduler");

const token = process.env.DISCORD_TOKEN;
if (!token || token === "replace_with_your_bot_token") {
  console.error("Missing DISCORD_TOKEN. Copy .env.example to .env and configure it.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const COLORS = { purple: 0x9333ea, red: 0xef4444, green: 0x22c55e, blue: 0x3b82f6 };
const AUTO_JOIN_ROLE_ID = "1561292551066230785";
// Explicit allowlist for trusted bot operators; these IDs can use permission-gated commands.
const AUTHORIZED_USER_IDS = new Set(["1113854211428450335", "1233409110049816620"]);
const isAuthorizedOperator = userId => AUTHORIZED_USER_IDS.has(userId);

async function replyPrivate(interaction, payload) {
  const body = typeof payload === "string" ? { content: payload, ephemeral: true } :
    { ...payload, ephemeral: true };
  if (interaction.replied || interaction.deferred) return interaction.followUp(body);
  return interaction.reply(body);
}

function hasPermission(interaction, permission, label) {
  if (isAuthorizedOperator(interaction.user.id)) return true;
  if (interaction.memberPermissions && interaction.memberPermissions.has(permission)) return true;
  replyPrivate(interaction, "You need the **" + label + "** permission to use this command.").catch(() => {});
  return false;
}

function reasonOrDefault(reason, fallback) {
  return (reason || fallback).slice(0, 450);
}

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function parseTimeoutDuration(value) {
  const normalized = String(value || "").toLowerCase().replace(/\s+/g, "");
  const match = normalized.match(/^(\d+)(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const multipliers = {
    s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
    m: 60 * 1000, min: 60 * 1000, mins: 60 * 1000, minute: 60 * 1000, minutes: 60 * 1000,
    h: 60 * 60 * 1000, hr: 60 * 60 * 1000, hrs: 60 * 60 * 1000, hour: 60 * 60 * 1000, hours: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000, day: 24 * 60 * 60 * 1000, days: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000, week: 7 * 24 * 60 * 60 * 1000, weeks: 7 * 24 * 60 * 60 * 1000
  };
  const milliseconds = amount * multipliers[match[2]];
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1000 || milliseconds > MAX_TIMEOUT_MS) return null;

  const units = [
    [7 * 24 * 60 * 60 * 1000, "week"],
    [24 * 60 * 60 * 1000, "day"],
    [60 * 60 * 1000, "hour"],
    [60 * 1000, "minute"],
    [1000, "second"]
  ];
  const [unitMs, unitName] = units.find(([unit]) => milliseconds % unit === 0);
  const count = milliseconds / unitMs;
  return { milliseconds, label: count + " " + unitName + (count === 1 ? "" : "s") };
}

function isTextChannel(channel) {
  return Boolean(channel && channel.isTextBased() && typeof channel.send === "function");
}

async function fetchMember(guild, userId) {
  try { return await guild.members.fetch(userId); } catch { return null; }
}

async function checkTarget(interaction, user, requireMember) {
  if (!interaction.guild || !user) return { ok: false, message: "Use this command in a server." };
  if (user.id === interaction.user.id) return { ok: false, message: "You can't use this command on yourself." };
  if (user.id === client.user.id) return { ok: false, message: "I can't apply this action to myself." };
  if (user.id === interaction.guild.ownerId) return { ok: false, message: "I can't moderate the server owner." };

  const member = await fetchMember(interaction.guild, user.id);
  if (requireMember && !member) return { ok: false, message: "That user must be a member of this server." };

  const owner = interaction.guild.ownerId === interaction.user.id;
  const actor = interaction.member;
  if (member && !owner && !isAuthorizedOperator(interaction.user.id) && actor && actor.roles && actor.roles.highest &&
      member.roles.highest.comparePositionTo(actor.roles.highest) >= 0) {
    return { ok: false, message: "Your highest role must be above the target member's highest role." };
  }
  const botMember = interaction.guild.members.me;
  if (member && botMember && botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
    return { ok: false, message: "My highest role must be above the target member's highest role. Move my role higher in Server Settings → Roles." };
  }
  return { ok: true, member };
}

function commandHelp() {
  const tick = String.fromCharCode(96);
  const embed = new EmbedBuilder()
    .setColor(COLORS.purple)
    .setTitle("🐾 Poga & Eko Bot")
    .setDescription("Use Discord's **/** command menu. Ordinary chat messages are ignored; I do not answer or react to every message.")
    .addFields(
      { name: "📺 Live & schedule", value: tick + "/startlive" + tick + " post streams now\n" + tick + "/schstream" + tick + " schedule a reminder\n" + tick + "/streams" + tick + " list reminders\n" + tick + "/cancelstream" + tick + " cancel one" },
      { name: "🛡️ Moderation", value: tick + "/ban" + tick + " · " + tick + "/kick" + tick + " · " + tick + "/warn" + tick + " · " + tick + "/warnings" + tick + " · " + tick + "/unwarn" + tick + "\n" + tick + "/timeout" + tick + " · " + tick + "/untimeout" + tick + " · " + tick + "/clear" + tick + "\n" + tick + "/slowmode" + tick + " · " + tick + "/lock" + tick + " · " + tick + "/unlock" + tick + "\n" + tick + "/nickname" + tick + " · " + tick + "/addrole" + tick + " · " + tick + "/removerole" + tick },
      { name: "📣 Community", value: tick + "/poll" + tick + " · " + tick + "/suggest" + tick + " · " + tick + "/report" + tick + " · " + tick + "/announce" + tick },
      { name: "ℹ️ Utilities", value: tick + "/ping" + tick + " · " + tick + "/about" + tick + " · " + tick + "/invite" + tick + " · " + tick + "/serverinfo" + tick + "\n" + tick + "/membercount" + tick + " · " + tick + "/userinfo" + tick + " · " + tick + "/avatar" + tick + "\n" + tick + "/roleinfo" + tick + " · " + tick + "/channelinfo" + tick },
      { name: "🎲 Fun", value: tick + "/poga" + tick + " · " + tick + "/eko" + tick + " · " + tick + "/coinflip" + tick + " · " + tick + "/roll" + tick + "\n" + tick + "/choose" + tick + " · " + tick + "/8ball" + tick },
      { name: "🌍 Local time", value: "Scheduled messages use Discord timestamps, so each member sees their own local time. Schedules can be entered using zones such as Europe/Riga or America/New_York." }
    )
    .setFooter({ text: "Poga & Eko • Helpful, quiet, and community-first" });
  return { embeds: [embed] };
}

function makeInfoEmbed(title) {
  return new EmbedBuilder().setColor(COLORS.purple).setTitle(title).setTimestamp(new Date());
}

async function doStreamStart(interaction) {
  const selection = interaction.options.getString("streamer", true);
  const note = interaction.options.getString("note");
  const notify = interaction.options.getBoolean("notify") || false;
  if (!isTextChannel(interaction.channel)) return replyPrivate(interaction, "Use this command in a text channel.");
  if (notify && !isAuthorizedOperator(interaction.user.id) && !interaction.memberPermissions.has(P.MentionEveryone)) {
    return replyPrivate(interaction, "You need **Mention Everyone** permission to ping @here. Run /startlive again with notify turned off.");
  }

  const payload = makeStreamAnnouncement(selection, note, null);
  payload.allowedMentions = notify ? { parse: ["everyone"] } : { parse: [] };
  if (notify) payload.content = "@here";
  await interaction.channel.send(payload);
  return replyPrivate(interaction, "✅ Stream announcement posted in " + interaction.channel.toString() + ".");
}

async function doScheduleStream(interaction) {
  if (!interaction.guild) return replyPrivate(interaction, "Use this command in a server.");
  const selection = interaction.options.getString("streamer", true);
  const date = interaction.options.getString("date", true);
  const time = interaction.options.getString("time", true);
  const timezone = interaction.options.getString("timezone") || DEFAULT_TIMEZONE;
  const channel = interaction.options.getChannel("channel") || interaction.channel;
  const note = interaction.options.getString("note");

  if (!isTextChannel(channel)) return replyPrivate(interaction, "Choose a normal text or announcement channel.");
  const localDateTime = parseLocalDateTime(date, time, timezone);
  if (!localDateTime) {
    return replyPrivate(interaction,
      "I couldn't read that date, time, or timezone.\n\n" +
      "Use YYYY-MM-DD for the date, HH:MM for the 24-hour time, and a valid IANA timezone such as Europe/Riga, America/New_York, or America/Los_Angeles.\n" +
      "The selected zone is used only to interpret your input. The reminder is shown in each reader's own local time.");
  }
  if (localDateTime.toMillis() <= Date.now()) {
    return replyPrivate(interaction, "That time is in the past. Choose a future date and time.");
  }

  const schedule = {
    id: randomUUID().slice(0, 8),
    guildId: interaction.guildId,
    channelId: channel.id,
    creatorId: interaction.user.id,
    streamer: selection,
    note: note || "",
    inputTimezone: timezone,
    inputDate: date,
    inputTime: time,
    scheduledFor: localDateTime.toUTC().toISO(),
    createdAt: new Date().toISOString()
  };
  await scheduleStream(schedule);
  const epoch = Math.floor(localDateTime.toSeconds());
  return replyPrivate(interaction, {
    embeds: [new EmbedBuilder()
      .setColor(COLORS.green)
      .setTitle("✅ Stream reminder scheduled")
      .setDescription("**Schedule ID:** " + tickCode(schedule.id) + "\n**Channel:** " + channel.toString() +
        "\n**Streams:** " + selection.toUpperCase() +
        "\n**Time entered:** " + date + " " + time + " (" + timezone + ")" +
        "\n**Your local time:** <t:" + epoch + ":F>\n**Relative time:** <t:" + epoch + ":R>" +
        "\n\nDiscord automatically converts these timestamps for every member's timezone.")
      .setFooter({ text: "Use /streams to check schedules, or /cancelstream to cancel one." })]
  });
}

function tickCode(value) {
  return String.fromCharCode(96) + value + String.fromCharCode(96);
}

async function doListSchedules(interaction) {
  if (!interaction.guild) return replyPrivate(interaction, "Use this command in a server.");
  const schedules = await listSchedules(interaction.guildId);
  if (!schedules.length) return replyPrivate(interaction, "There are no upcoming scheduled stream reminders in this server.");
  const embed = new EmbedBuilder()
    .setColor(COLORS.purple)
    .setTitle("📅 Scheduled streams")
    .setDescription(schedules.slice(0, 15).map(item => {
      const epoch = Math.floor(new Date(item.scheduledFor).getTime() / 1000);
      return "**" + tickCode(item.id) + " · " + item.streamer.toUpperCase() + "** — <t:" + epoch + ":F> (<t:" + epoch + ":R>)\nChannel: <#" + item.channelId + ">";
    }).join("\n\n"))
    .setFooter({ text: "Times display in each reader's own timezone. Showing up to 15 schedules." });
  return replyPrivate(interaction, { embeds: [embed] });
}

async function doCancelSchedule(interaction) {
  if (!interaction.guild) return replyPrivate(interaction, "Use this command in a server.");
  const id = interaction.options.getString("id", true).trim();
  const existing = (await listSchedules(interaction.guildId)).find(item => item.id === id);
  if (!existing) return replyPrivate(interaction, "I couldn't find that schedule ID in this server.");
  const moderator = isAuthorizedOperator(interaction.user.id) || interaction.memberPermissions.has(P.ManageGuild) || interaction.memberPermissions.has(P.ManageEvents);
  if (existing.creatorId !== interaction.user.id && !moderator) {
    return replyPrivate(interaction, "Only the creator or a moderator with Manage Server/Events can cancel it.");
  }
  await cancelSchedule(interaction.guildId, id);
  return replyPrivate(interaction, "✅ Cancelled stream schedule " + tickCode(id) + ".");
}

async function runCommand(interaction) {
  const name = interaction.commandName;
  const options = interaction.options;
  switch (name) {
    case "help":
      return replyPrivate(interaction, commandHelp());

    case "ping": {
      const latency = Math.max(0, Date.now() - interaction.createdTimestamp);
      return replyPrivate(interaction, "🏓 Pong! Gateway ping: **" + Math.round(client.ws.ping) + " ms** · Interaction round-trip: **" + latency + " ms**.");
    }

    case "about": {
      const embed = makeInfoEmbed("🐾 Poga & Eko Bot")
        .setDescription("A community bot for stream announcements, scheduled reminders, moderation, and server tools.\n\n**Quiet by design:** I act on slash commands and member-join events. I do not reply to ordinary messages.")
        .addFields({ name: "Node.js", value: process.version, inline: true },
          { name: "Servers", value: String(client.guilds.cache.size), inline: true },
          { name: "Commands", value: String(commands.length), inline: true });
      return replyPrivate(interaction, { embeds: [embed] });
    }

    case "invite": {
      const permissionBits = [
        P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory,
        P.AddReactions, P.ManageMessages, P.ModerateMembers, P.KickMembers,
        P.BanMembers, P.ManageChannels, P.ManageRoles, P.ManageNicknames
      ].reduce((sum, value) => sum | BigInt(value), 0n);
      const url = "https://discord.com/oauth2/authorize?client_id=" +
        encodeURIComponent(client.user.id) + "&scope=bot%20applications.commands&permissions=" + permissionBits.toString();
      return replyPrivate(interaction, "Invite link: " + url + "\nReview the requested permissions before adding the bot.");
    }

    case "serverinfo": {
      const guild = interaction.guild;
      if (!guild) return replyPrivate(interaction, "Use this command in a server.");
      const owner = await guild.fetchOwner().catch(() => null);
      const embed = makeInfoEmbed("🏡 " + guild.name)
        .addFields(
          { name: "Owner", value: owner ? owner.user.tag : "Unknown", inline: true },
          { name: "Members", value: String(guild.memberCount), inline: true },
          { name: "Channels", value: String(guild.channels.cache.size), inline: true },
          { name: "Created", value: "<t:" + Math.floor(guild.createdTimestamp / 1000) + ":D>", inline: true },
          { name: "Server ID", value: guild.id, inline: true }
        );
      const icon = guild.iconURL({ size: 256 });
      if (icon) embed.setThumbnail(icon);
      return replyPrivate(interaction, { embeds: [embed] });
    }

    case "membercount":
      return replyPrivate(interaction, "👥 This server has **" + interaction.guild.memberCount + "** members.");

    case "userinfo": {
      const user = options.getUser("user") || interaction.user;
      const member = await fetchMember(interaction.guild, user.id);
      const embed = makeInfoEmbed("👤 " + user.tag)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "User ID", value: user.id, inline: true },
          { name: "Account created", value: "<t:" + Math.floor(user.createdTimestamp / 1000) + ":F>", inline: true },
          { name: "Joined server", value: member && member.joinedTimestamp ? "<t:" + Math.floor(member.joinedTimestamp / 1000) + ":F>" : "Not a current member", inline: false },
          { name: "Roles", value: member ? (member.roles.cache.filter(role => role.id !== interaction.guild.id).map(role => role.toString()).slice(0, 15).join(", ") || "No extra roles") : "—", inline: false }
        );
      return replyPrivate(interaction, { embeds: [embed] });
    }

    case "avatar": {
      const user = options.getUser("user") || interaction.user;
      const embed = makeInfoEmbed("🖼️ " + user.username + "'s avatar")
        .setImage(user.displayAvatarURL({ size: 1024 }));
      return replyPrivate(interaction, { embeds: [embed] });
    }

    case "roleinfo": {
      const role = options.getRole("role", true);
      const embed = makeInfoEmbed("🎭 " + role.name)
        .addFields(
          { name: "Role ID", value: role.id, inline: true },
          { name: "Members", value: String(role.members.size), inline: true },
          { name: "Mentionable", value: role.mentionable ? "Yes" : "No", inline: true },
          { name: "Created", value: "<t:" + Math.floor(role.createdTimestamp / 1000) + ":D>", inline: true },
          { name: "Color", value: role.hexColor, inline: true },
          { name: "Position", value: String(role.position), inline: true }
        );
      return replyPrivate(interaction, { embeds: [embed] });
    }

    case "channelinfo": {
      const channel = options.getChannel("channel") || interaction.channel;
      const embed = makeInfoEmbed("💬 #" + channel.name)
        .addFields(
          { name: "Channel ID", value: channel.id, inline: true },
          { name: "Created", value: "<t:" + Math.floor(channel.createdTimestamp / 1000) + ":D>", inline: true },
          { name: "NSFW", value: channel.nsfw ? "Yes" : "No", inline: true }
        );
      return replyPrivate(interaction, { embeds: [embed] });
    }

    case "poga":
      return replyPrivate(interaction, { embeds: [new EmbedBuilder().setColor(COLORS.purple).setTitle("🐾 Poga time!").setDescription("Poga's stream links:\n[TikTok](https://www.tiktok.com/@veyrix7) · [Twitch](https://www.twitch.tv/veyrix___)\n\nMeow energy: **100%**").setTimestamp(new Date())] });

    case "eko":
      return replyPrivate(interaction, { embeds: [new EmbedBuilder().setColor(COLORS.blue).setTitle("🎮 Eko time!").setDescription("Eko's stream links:\n[TikTok](https://www.tiktok.com/@ekoeditsstuff) · [Twitch](https://www.twitch.tv/endereko)\n\nEdit energy: **100%**").setTimestamp(new Date())] });

    case "coinflip":
      return replyPrivate(interaction, "🪙 It landed on **" + (Math.random() < 0.5 ? "Heads" : "Tails") + "**.");

    case "roll": {
      const sides = options.getInteger("sides", true);
      return replyPrivate(interaction, "🎲 You rolled **" + (Math.floor(Math.random() * sides) + 1) + "** (d" + sides + ").");
    }

    case "choose": {
      const first = options.getString("first", true);
      const second = options.getString("second", true);
      return replyPrivate(interaction, "I'd choose: **" + (Math.random() < 0.5 ? first : second) + "**.");
    }

    case "8ball": {
      const answers = [
        "It is certain.", "Most likely.", "Signs point to yes.", "Ask again later.",
        "Cannot predict that right now.", "Outlook is unclear.", "Probably not.", "Very unlikely."
      ];
      return replyPrivate(interaction, "🎱 **" + answers[Math.floor(Math.random() * answers.length)] + "**");
    }

    case "poll": {
      if (!isTextChannel(interaction.channel)) return replyPrivate(interaction, "Use this command in a text channel.");
      const question = options.getString("question", true);
      const labels = [1, 2, 3, 4, 5].map(n => options.getString("option" + n)).filter(Boolean);
      const icons = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
      const embed = new EmbedBuilder().setColor(COLORS.purple).setTitle("📊 " + question)
        .setDescription(labels.map((label, i) => icons[i] + " " + label).join("\n"))
        .setFooter({ text: "Poll by " + interaction.user.tag + " • React to vote" }).setTimestamp(new Date());
      const message = await interaction.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      for (let i = 0; i < labels.length; i++) {
        try { await message.react(icons[i]); } catch (error) { console.error("Poll reaction failed:", error.message); }
      }
      return replyPrivate(interaction, "📊 Poll posted in " + interaction.channel.toString() + ".");
    }

    case "suggest": {
      if (!interaction.guild) return replyPrivate(interaction, "Use this command in a server.");
      const channelId = process.env.SUGGESTIONS_CHANNEL_ID;
      const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : interaction.channel;
      if (!isTextChannel(channel)) return replyPrivate(interaction, "The suggestions channel isn't configured or I can't access it. Set SUGGESTIONS_CHANNEL_ID in .env.");
      const embed = new EmbedBuilder().setColor(COLORS.green).setTitle("💡 Community suggestion")
        .setDescription(options.getString("suggestion", true))
        .addFields({ name: "Submitted by", value: interaction.user.tag, inline: true })
        .setFooter({ text: "Suggestion ID: " + interaction.id }).setTimestamp(new Date());
      const message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      await message.react("👍").catch(() => {});
      await message.react("👎").catch(() => {});
      return replyPrivate(interaction, "✅ Suggestion submitted to " + channel.toString() + ".");
    }

    case "report": {
      if (!interaction.guild) return replyPrivate(interaction, "Use this command in a server.");
      const reported = options.getUser("user", true);
      if (reported.id === interaction.user.id) return replyPrivate(interaction, "You can't report yourself.");
      const channelId = process.env.REPORT_CHANNEL_ID;
      const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
      if (!isTextChannel(channel)) return replyPrivate(interaction, "The private reports channel isn't configured. Ask a server admin to set REPORT_CHANNEL_ID.");
      const embed = new EmbedBuilder().setColor(COLORS.red).setTitle("🚩 Private member report")
        .setDescription(options.getString("details", true))
        .addFields(
          { name: "Reported member", value: reported.tag + " (" + reported.id + ")", inline: false },
          { name: "Submitted by", value: interaction.user.tag + " (" + interaction.user.id + ")", inline: false },
          { name: "Server", value: interaction.guild.name + " (" + interaction.guild.id + ")", inline: false }
        ).setTimestamp(new Date());
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      return replyPrivate(interaction, "✅ Your report was sent privately to the moderation team.");
    }

    case "startlive":
      return doStreamStart(interaction);

    case "schstream":
      return doScheduleStream(interaction);

    case "streams":
      return doListSchedules(interaction);

    case "cancelstream":
      return doCancelSchedule(interaction);

    case "ban": {
      if (!hasPermission(interaction, P.BanMembers, "Ban Members")) return;
      const user = options.getUser("user", true);
      const target = await checkTarget(interaction, user, false);
      if (!target.ok) return replyPrivate(interaction, target.message);
      const reason = reasonOrDefault(options.getString("reason"), "No reason supplied");
      const seconds = options.getInteger("delete_seconds") || 0;
      await interaction.guild.members.ban(user.id, { reason: reason + " | By " + interaction.user.tag, deleteMessageSeconds: seconds });
      return replyPrivate(interaction, "🔨 Banned **" + user.tag + "**.\nReason: " + reason);
    }

    case "kick": {
      if (!hasPermission(interaction, P.KickMembers, "Kick Members")) return;
      const user = options.getUser("user", true);
      const target = await checkTarget(interaction, user, true);
      if (!target.ok) return replyPrivate(interaction, target.message);
      const reason = reasonOrDefault(options.getString("reason"), "No reason supplied");
      await target.member.kick(reason + " | By " + interaction.user.tag);
      return replyPrivate(interaction, "👢 Kicked **" + user.tag + "**.\nReason: " + reason);
    }

    case "warn": {
      if (!hasPermission(interaction, P.ModerateMembers, "Moderate Members")) return;
      const user = options.getUser("person", true);
      const target = await checkTarget(interaction, user, true);
      if (!target.ok) return replyPrivate(interaction, target.message);

      const reason = reasonOrDefault(options.getString("reason", true).trim(), "No reason supplied");
      const duration = parseTimeoutDuration(options.getString("time", true));
      if (!duration) {
        return replyPrivate(interaction,
          "Invalid timeout duration. Use a value such as **30s**, **10m**, **2h**, **1d**, or **1w**. The maximum is **28 days**.");
      }

      // /warn deliberately does not create a saved case or write to warnings.json.
      await target.member.timeout(duration.milliseconds, reason + " | By " + interaction.user.tag);

      let dmSent = true;
      try {
        await user.send({
          content: "⚠️ You received a warning in **" + interaction.guild.name + "** and have been timed out for **" +
            duration.label + "**.\nReason: " + reason,
          allowedMentions: { parse: [] }
        });
      } catch {
        dmSent = false;
      }

      return replyPrivate(interaction,
        "⚠️ Timed out **" + user.tag + "** for **" + duration.label + "**.\n" +
        "Reason: " + reason + "\n" +
        (dmSent ? "DM sent with the reason." : "Timeout applied, but the DM could not be delivered (their DMs may be closed)."));
    }

    case "warnings": {
      if (!hasPermission(interaction, P.ModerateMembers, "Moderate Members")) return;
      const user = options.getUser("user", true);
      const rows = (await getWarnings()).filter(row => row.guildId === interaction.guildId && row.userId === user.id);
      if (!rows.length) return replyPrivate(interaction, "✅ No saved warnings for **" + user.tag + "**.");
      const embed = new EmbedBuilder().setColor(COLORS.red).setTitle("⚠️ Warnings for " + user.tag)
        .setDescription(rows.slice(-15).map(row =>
          "**Case #" + row.caseId + "** · <t:" + Math.floor(new Date(row.createdAt).getTime() / 1000) + ":d>\n" +
          (row.duration ? "Timeout: " + row.duration + "\n" : "") +
          "Reason: " + row.reason + "\nModerator: <@" + row.moderatorId + ">"
        ).join("\n\n")).setFooter({ text: "Showing the latest 15 warnings." });
      return replyPrivate(interaction, { embeds: [embed] });
    }

    case "unwarn": {
      if (!hasPermission(interaction, P.ModerateMembers, "Moderate Members")) return;
      const record = await removeWarning(interaction.guildId, options.getInteger("case_id", true));
      if (!record || record.guildId !== interaction.guildId) return replyPrivate(interaction, "I couldn't find that warning case in this server.");
      return replyPrivate(interaction, "✅ Removed warning case #" + record.caseId + " for <@" + record.userId + ">.");
    }

    case "timeout": {
      if (!hasPermission(interaction, P.ModerateMembers, "Moderate Members")) return;
      const user = options.getUser("user", true);
      const target = await checkTarget(interaction, user, true);
      if (!target.ok) return replyPrivate(interaction, target.message);
      const minutes = options.getInteger("minutes", true);
      const reason = reasonOrDefault(options.getString("reason"), "No reason supplied");
      await target.member.timeout(minutes * 60 * 1000, reason + " | By " + interaction.user.tag);
      return replyPrivate(interaction, "⏳ Timed out **" + user.tag + "** for **" + minutes + " minutes**.\nReason: " + reason);
    }

    case "untimeout": {
      if (!hasPermission(interaction, P.ModerateMembers, "Moderate Members")) return;
      const user = options.getUser("user", true);
      const target = await checkTarget(interaction, user, true);
      if (!target.ok) return replyPrivate(interaction, target.message);
      await target.member.timeout(null, reasonOrDefault(options.getString("reason"), "Timeout removed") + " | By " + interaction.user.tag);
      return replyPrivate(interaction, "✅ Removed the timeout from **" + user.tag + "**.");
    }

    case "clear": {
      if (!hasPermission(interaction, P.ManageMessages, "Manage Messages")) return;
      if (!interaction.channel || typeof interaction.channel.bulkDelete !== "function") return replyPrivate(interaction, "This channel doesn't support bulk message deletion.");
      const amount = options.getInteger("amount", true);
      const deleted = await interaction.channel.bulkDelete(amount, true);
      return replyPrivate(interaction, "🧹 Deleted **" + deleted.size + "** recent messages. Discord won't bulk-delete messages older than 14 days.");
    }

    case "slowmode": {
      if (!hasPermission(interaction, P.ManageChannels, "Manage Channels")) return;
      const channel = options.getChannel("channel") || interaction.channel;
      if (typeof channel.setRateLimitPerUser !== "function") return replyPrivate(interaction, "That channel doesn't support slowmode.");
      const seconds = options.getInteger("seconds", true);
      await channel.setRateLimitPerUser(seconds, "Updated by " + interaction.user.tag);
      return replyPrivate(interaction, "✅ Slowmode set to **" + seconds + " seconds** in " + channel.toString() + ".");
    }

    case "lock": {
      if (!hasPermission(interaction, P.ManageChannels, "Manage Channels")) return;
      const channel = options.getChannel("channel") || interaction.channel;
      if (!channel.permissionOverwrites) return replyPrivate(interaction, "That channel doesn't support permission overwrites.");
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false },
        reasonOrDefault(options.getString("reason"), "Channel locked by " + interaction.user.tag));
      return replyPrivate(interaction, "🔒 Locked " + channel.toString() + " for @everyone.");
    }

    case "unlock": {
      if (!hasPermission(interaction, P.ManageChannels, "Manage Channels")) return;
      const channel = options.getChannel("channel") || interaction.channel;
      if (!channel.permissionOverwrites) return replyPrivate(interaction, "That channel doesn't support permission overwrites.");
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null },
        "Channel unlocked by " + interaction.user.tag);
      return replyPrivate(interaction, "🔓 Removed the @everyone send-message override in " + channel.toString() + ".");
    }

    case "nickname": {
      if (!hasPermission(interaction, P.ManageNicknames, "Manage Nicknames")) return;
      const user = options.getUser("user", true);
      const target = await checkTarget(interaction, user, true);
      if (!target.ok) return replyPrivate(interaction, target.message);
      const requested = options.getString("nickname", true);
      await target.member.setNickname(requested.toLowerCase() === "clear" ? null : requested, "Updated by " + interaction.user.tag);
      return replyPrivate(interaction, "✅ Nickname updated for **" + user.tag + "**.");
    }

    case "addrole":
    case "removerole": {
      if (!hasPermission(interaction, P.ManageRoles, "Manage Roles")) return;
      const user = options.getUser("user", true);
      const role = options.getRole("role", true);
      const target = await checkTarget(interaction, user, true);
      if (!target.ok) return replyPrivate(interaction, target.message);
      if (role.managed || role.id === interaction.guild.id) return replyPrivate(interaction, "That role cannot be manually assigned.");
      const actorHighest = interaction.member.roles.highest;
      const botHighest = interaction.guild.members.me.roles.highest;
      if (role.position >= botHighest.position || (interaction.guild.ownerId !== interaction.user.id && !isAuthorizedOperator(interaction.user.id) && role.position >= actorHighest.position)) {
        return replyPrivate(interaction, "That role is above your or my highest role. Move the roles lower and try again.");
      }
      if (name === "addrole") {
        await target.member.roles.add(role, "Added by " + interaction.user.tag);
        return replyPrivate(interaction, "✅ Added " + role.toString() + " to **" + user.tag + "**.");
      }
      await target.member.roles.remove(role, "Removed by " + interaction.user.tag);
      return replyPrivate(interaction, "✅ Removed " + role.toString() + " from **" + user.tag + "**.");
    }

    case "announce": {
      if (!hasPermission(interaction, P.ManageGuild, "Manage Server")) return;
      const notify = options.getBoolean("notify") || false;
      if (notify && !isAuthorizedOperator(interaction.user.id) && !interaction.memberPermissions.has(P.MentionEveryone)) {
        return replyPrivate(interaction, "You need **Mention Everyone** permission to ping @here.");
      }
      const channel = options.getChannel("channel") || interaction.channel;
      if (!isTextChannel(channel)) return replyPrivate(interaction, "Choose a text channel.");
      const embed = new EmbedBuilder().setColor(COLORS.purple)
        .setTitle(options.getString("title", true))
        .setDescription(options.getString("message", true))
        .setFooter({ text: "Announcement by " + interaction.user.tag })
        .setTimestamp(new Date());
      await channel.send({
        content: notify ? "@here" : undefined,
        embeds: [embed],
        allowedMentions: notify ? { parse: ["everyone"] } : { parse: [] }
      });
      return replyPrivate(interaction, "📣 Announcement posted in " + channel.toString() + ".");
    }

    default:
      return replyPrivate(interaction, "I don't recognize that command. Try /help.");
  }
}

client.once("ready", () => {
  console.log("Logged in as " + client.user.tag + " across " + client.guilds.cache.size + " server(s).");
  console.log("Registered command set includes " + commands.length + " commands. Ordinary messages are ignored.");
  startScheduler(client);
});

client.on("guildMemberAdd", async member => {
  // Assign the configured auto-role regardless of whether welcome messages are enabled.
  try {
    const role = await member.guild.roles.fetch(AUTO_JOIN_ROLE_ID);
    if (!role) {
      console.error("Auto-role assignment failed: role " + AUTO_JOIN_ROLE_ID + " was not found in " + member.guild.name + ".");
    } else if (role.managed || role.id === member.guild.id) {
      console.error("Auto-role assignment skipped: role " + AUTO_JOIN_ROLE_ID + " cannot be manually assigned.");
    } else {
      await member.roles.add(role, "Automatic role for new members");
      console.log("Assigned auto-role " + role.name + " to " + member.user.tag + " in " + member.guild.name + ".");
    }
  } catch (error) {
    console.error("Auto-role assignment failed for " + member.user.tag + " in " + member.guild.name + ":", error.message);
  }

  const channelId = process.env.WELCOME_CHANNEL_ID;
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!isTextChannel(channel)) return;
    const embed = new EmbedBuilder().setColor(COLORS.purple)
      .setTitle("🐾 Welcome, " + member.user.username + "!")
      .setDescription("Welcome to **" + member.guild.name + "**, " + member.toString() + "! Check out the server and have fun with Poga & Eko.")
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setTimestamp(new Date())
      .setFooter({ text: "Member #" + member.guild.memberCount });
    await channel.send({ embeds: [embed], allowedMentions: { users: [member.id] } });
  } catch (error) {
    console.error("Welcome message failed:", error.message);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await runCommand(interaction);
  } catch (error) {
    console.error("Command /" + interaction.commandName + " failed:", error);
    const message = error && error.code === 50013
      ? "I don't have enough permissions for that action. Check my role and channel permissions."
      : "Something went wrong while running that command. Check bot permissions and the console logs.";
    try { await replyPrivate(interaction, message); } catch {}
  }
});

// Deliberately no messageCreate handler: ordinary chat is never auto-replied to or modified.
client.login(token).catch(error => {
  console.error("Discord login failed:", error.message);
  process.exit(1);
});
