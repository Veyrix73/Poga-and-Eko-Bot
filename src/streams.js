const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const STREAMERS = {
  poga: {
    name: "Poga",
    tiktok: "https://www.tiktok.com/@veyrix7",
    twitch: "https://www.twitch.tv/veyrix___",
    emoji: "🐾"
  },
  eko: {
    name: "Eko",
    tiktok: "https://www.tiktok.com/@ekoeditsstuff",
    twitch: "https://www.twitch.tv/endereko",
    emoji: "🎮"
  }
};

function selectedStreamers(selection) {
  if (String(selection).toLowerCase() === "both") return [STREAMERS.poga, STREAMERS.eko];
  const item = STREAMERS[String(selection).toLowerCase()];
  if (!item) throw new Error("Choose Poga, Eko, or both.");
  return [item];
}

function makeStreamAnnouncement(selection, note, scheduledEpoch) {
  const streamers = selectedStreamers(selection);
  const both = streamers.length === 2;
  const embed = new EmbedBuilder()
    .setColor(0x9333ea)
    .setTitle(scheduledEpoch ? (both ? "📅 Poga & Eko stream reminder" : "📅 " + streamers[0].name + " stream reminder") :
      (both ? "🔴 Poga & Eko are LIVE!" : "🔴 " + streamers[0].name + " is LIVE!"))
    .setDescription(scheduledEpoch
      ? "The scheduled stream time is here! Discord automatically displays the time below in each reader's local timezone."
      : (both ? "Both streams are up! Choose your platform below and come say hello." :
        streamers[0].emoji + " **" + streamers[0].name + " is live!**\nHead to the stream and come say hello."))
    .setTimestamp(new Date())
    .setFooter({ text: "Poga & Eko • Live updates" });

  if (scheduledEpoch) {
    embed.addFields({
      name: "🕒 Your local time",
      value: "<t:" + scheduledEpoch + ":F>\n<t:" + scheduledEpoch + ":R>",
      inline: false
    });
  }

  for (const streamer of streamers) {
    embed.addFields({
      name: streamer.emoji + " " + streamer.name,
      value: "[Watch on TikTok](" + streamer.tiktok + ")  •  [Watch on Twitch](" + streamer.twitch + ")",
      inline: false
    });
  }

  if (note) embed.addFields({ name: "Stream note", value: note.slice(0, 1024), inline: false });

  const buttons = [];
  for (const streamer of streamers) {
    buttons.push(
      new ButtonBuilder().setLabel(streamer.name + " • TikTok").setStyle(ButtonStyle.Link).setURL(streamer.tiktok),
      new ButtonBuilder().setLabel(streamer.name + " • Twitch").setStyle(ButtonStyle.Link).setURL(streamer.twitch)
    );
  }

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(buttons)],
    allowedMentions: { parse: [] }
  };
}

module.exports = { STREAMERS, selectedStreamers, makeStreamAnnouncement };
