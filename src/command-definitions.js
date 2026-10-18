const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType } = require("discord.js");
const textTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const textChannel = option => option.addChannelTypes(...textTypes);

module.exports = [
  new SlashCommandBuilder().setName("help").setDescription("Show the command guide."),
  new SlashCommandBuilder().setName("ping").setDescription("Check the bot and API latency."),
  new SlashCommandBuilder().setName("about").setDescription("About Poga & Eko Bot."),
  new SlashCommandBuilder().setName("invite").setDescription("Get an invite link for this bot."),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Show details about this server."),
  new SlashCommandBuilder().setName("membercount").setDescription("Show the server member count."),
  new SlashCommandBuilder().setName("userinfo").setDescription("Show information about a member.")
    .addUserOption(o => o.setName("user").setDescription("Member to inspect.").setRequired(false)),
  new SlashCommandBuilder().setName("avatar").setDescription("Show a member's avatar.")
    .addUserOption(o => o.setName("user").setDescription("Member; defaults to you.").setRequired(false)),
  new SlashCommandBuilder().setName("roleinfo").setDescription("Show information about a role.")
    .addRoleOption(o => o.setName("role").setDescription("Role to inspect.").setRequired(true)),
  new SlashCommandBuilder().setName("channelinfo").setDescription("Show information about a channel.")
    .addChannelOption(o => textChannel(o.setName("channel").setDescription("Channel to inspect.")).setRequired(false)),
  new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin."),
  new SlashCommandBuilder().setName("roll").setDescription("Roll a die.")
    .addIntegerOption(o => o.setName("sides").setDescription("Number of sides (2–1000).").setMinValue(2).setMaxValue(1000).setRequired(true)),
  new SlashCommandBuilder().setName("choose").setDescription("Choose between two options.")
    .addStringOption(o => o.setName("first").setDescription("First option.").setMaxLength(100).setRequired(true))
    .addStringOption(o => o.setName("second").setDescription("Second option.").setMaxLength(100).setRequired(true)),
  new SlashCommandBuilder().setName("8ball").setDescription("Ask the magic 8-ball.")
    .addStringOption(o => o.setName("question").setDescription("Your question.").setMaxLength(300).setRequired(true)),
  new SlashCommandBuilder().setName("suggest").setDescription("Submit a community suggestion.")
    .addStringOption(o => o.setName("suggestion").setDescription("Your suggestion.").setMaxLength(1500).setRequired(true)),
  new SlashCommandBuilder().setName("report").setDescription("Privately report a member to moderators.")
    .addUserOption(o => o.setName("user").setDescription("Member being reported.").setRequired(true))
    .addStringOption(o => o.setName("details").setDescription("What happened?").setMaxLength(1500).setRequired(true)),
  new SlashCommandBuilder().setName("cancelstream").setDescription("Cancel an existing scheduled reminder.")
    .addStringOption(o => o.setName("id").setDescription("ID of the existing reminder to cancel.").setRequired(true)),
  new SlashCommandBuilder().setName("ban").setDescription("Ban a user from the server.")
    .addUserOption(o => o.setName("user").setDescription("User to ban.").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason.").setMaxLength(500).setRequired(false))
    .addIntegerOption(o => o.setName("delete_seconds").setDescription("Delete recent message history (0–604800 seconds).").setMinValue(0).setMaxValue(604800).setRequired(false)),
  new SlashCommandBuilder().setName("kick").setDescription("Kick a member.")
    .addUserOption(o => o.setName("user").setDescription("Member to kick.").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason.").setMaxLength(500).setRequired(false)),
  new SlashCommandBuilder().setName("warn").setDescription("Warn a member, DM the reason, and apply a timeout.")
    .addUserOption(o => o.setName("person").setDescription("Member to warn and timeout.").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Why they are being warned.").setMaxLength(450).setRequired(true))
    .addStringOption(o => o.setName("time").setDescription("Timeout duration: 30s, 10m, 2h, 1d, 1w; maximum 28d.").setMaxLength(30).setRequired(true)),
  new SlashCommandBuilder().setName("warnings").setDescription("View saved warnings for a member.")
    .addUserOption(o => o.setName("user").setDescription("Member whose warnings to view.").setRequired(true)),
  new SlashCommandBuilder().setName("unwarn").setDescription("Remove a warning by its case ID.")
    .addIntegerOption(o => o.setName("case_id").setDescription("Case ID shown by /warnings.").setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName("timeout").setDescription("Temporarily mute a member.")
    .addUserOption(o => o.setName("user").setDescription("Member to timeout.").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setDescription("Duration in minutes (1–40320).").setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason.").setMaxLength(500).setRequired(false)),
  new SlashCommandBuilder().setName("untimeout").setDescription("Remove a member's timeout.")
    .addUserOption(o => o.setName("user").setDescription("Member to untimeout.").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason.").setMaxLength(500).setRequired(false)),
  new SlashCommandBuilder().setName("clear").setDescription("Delete up to 100 recent messages.")
    .addIntegerOption(o => o.setName("amount").setDescription("Number of messages (1–100).").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("slowmode").setDescription("Change a channel's slowmode.")
    .addIntegerOption(o => o.setName("seconds").setDescription("Seconds between messages (0 disables).").setMinValue(0).setMaxValue(21600).setRequired(true))
    .addChannelOption(o => textChannel(o.setName("channel").setDescription("Target channel; defaults to here.")).setRequired(false)),
  new SlashCommandBuilder().setName("lock").setDescription("Lock a text channel for @everyone.")
    .addChannelOption(o => textChannel(o.setName("channel").setDescription("Target channel; defaults to here.")).setRequired(false))
    .addStringOption(o => o.setName("reason").setDescription("Optional reason.").setMaxLength(300).setRequired(false)),
  new SlashCommandBuilder().setName("unlock").setDescription("Unlock a text channel for @everyone.")
    .addChannelOption(o => textChannel(o.setName("channel").setDescription("Target channel; defaults to here.")).setRequired(false)),
  new SlashCommandBuilder().setName("nickname").setDescription("Change a nickname; use clear to reset it.")
    .addUserOption(o => o.setName("user").setDescription("Member to rename.").setRequired(true))
    .addStringOption(o => o.setName("nickname").setDescription("Nickname, or clear.").setMaxLength(32).setRequired(true)),
  new SlashCommandBuilder().setName("addrole").setDescription("Give a member a role.")
    .addUserOption(o => o.setName("user").setDescription("Member.").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to give.").setRequired(true)),
  new SlashCommandBuilder().setName("removerole").setDescription("Remove a role from a member.")
    .addUserOption(o => o.setName("user").setDescription("Member.").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to remove.").setRequired(true)),
  new SlashCommandBuilder().setName("announce").setDescription("Post a formatted announcement.")
    .addStringOption(o => o.setName("title").setDescription("Title.").setMaxLength(200).setRequired(true))
    .addStringOption(o => o.setName("message").setDescription("Announcement text.").setMaxLength(3500).setRequired(true))
    .addChannelOption(o => textChannel(o.setName("channel").setDescription("Destination; defaults to here.")).setRequired(false))
    .addBooleanOption(o => o.setName("notify").setDescription("Ping @here if permitted.").setRequired(false))
].map(command => command.toJSON());
