const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, randomInt } = require("node:crypto");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const directory = path.resolve(process.env.DATA_DIR || "data");
const file = path.join(directory, "giveaways.json");
const endingGiveaways = new Set();
const pendingEntries = new Set();
let queue = Promise.resolve();
let schedulerStarted = false;

async function readGiveaways() {
  try {
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeGiveaways(items) {
  await fs.mkdir(directory, { recursive: true });
  const temp = file + ".tmp";
  await fs.writeFile(temp, JSON.stringify(items, null, 2) + "\n", "utf8");
  await fs.rename(temp, file);
}

// Serialize read-modify-write operations so simultaneous entries aren't lost.
function mutateGiveaways(mutator) {
  const task = queue.then(async () => {
    const items = await readGiveaways();
    const result = await mutator(items);
    await writeGiveaways(items);
    return result;
  });
  queue = task.catch(() => {});
  return task;
}

function entryRow(id, ended = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway:enter:" + id)
      .setLabel(ended ? "Giveaway Ended" : "Enter Giveaway")
      .setStyle(ended ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(ended)
  );
}

function giveawayEmbed(giveaway) {
  const endUnix = Math.floor(giveaway.endAt / 1000);
  const embed = new EmbedBuilder()
    .setColor(giveaway.ended ? 0x6b7280 : 0x9333ea)
    .setTitle((giveaway.ended ? "🎉 Giveaway ended: " : "🎉 Giveaway: ") + giveaway.prize)
    .setDescription(
      (giveaway.description ? giveaway.description + "\n\n" : "") +
      (giveaway.ended ? "This giveaway has ended." : "Click **Enter Giveaway** below to join.")
    )
    .addFields(
      { name: "Entries", value: String(giveaway.entries.length), inline: true },
      { name: "Winners", value: String(giveaway.winnersCount), inline: true },
      { name: giveaway.ended ? "Ended" : "Ends", value: "<t:" + endUnix + (giveaway.ended ? ":f>" : ":R>"), inline: true }
    )
    .setTimestamp(new Date(giveaway.createdAt));

  if (giveaway.ended) {
    const winners = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
    embed.addFields({
      name: "Winner" + (winners.length === 1 ? "" : "s"),
      value: winners.length ? winners.map(id => "<@" + id + ">").join(", ") : "No one entered this giveaway."
    });
    embed.setFooter({ text: "Poga & Eko Bot • Giveaway closed" });
  } else {
    embed.setFooter({ text: "Hosted by " + giveaway.hostTag });
  }
  return embed;
}

async function refreshMessage(client, giveaway) {
  if (!giveaway.messageId || !giveaway.channelId) return;
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    if (!channel || !channel.isTextBased() || typeof channel.messages?.fetch !== "function") return;
    const message = await channel.messages.fetch(giveaway.messageId);
    await message.edit({
      embeds: [giveawayEmbed(giveaway)],
      components: [entryRow(giveaway.id, giveaway.ended)],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    console.error("[giveaways] Could not update giveaway message " + giveaway.id + ":", error.message);
  }
}

async function createGiveaway(channel, details) {
  const now = Date.now();
  const giveaway = {
    id: randomUUID(),
    guildId: details.guildId,
    channelId: channel.id,
    messageId: null,
    hostId: details.hostId,
    hostTag: details.hostTag,
    prize: details.prize,
    description: details.description || "",
    winnersCount: details.winnersCount,
    endAt: now + details.durationMinutes * 60 * 1000,
    createdAt: new Date(now).toISOString(),
    entries: [],
    ended: false,
    winnerIds: []
  };

  await mutateGiveaways(items => { items.push(giveaway); return giveaway; });
  try {
    const message = await channel.send({
      embeds: [giveawayEmbed(giveaway)],
      components: [entryRow(giveaway.id)],
      allowedMentions: { parse: [] }
    });
    giveaway.messageId = message.id;
    await mutateGiveaways(items => {
      const index = items.findIndex(item => item.id === giveaway.id);
      if (index >= 0) items[index] = giveaway;
      return giveaway;
    });
    return giveaway;
  } catch (error) {
    await mutateGiveaways(items => {
      const index = items.findIndex(item => item.id === giveaway.id);
      if (index >= 0) items.splice(index, 1);
    }).catch(() => {});
    throw error;
  }
}

async function enterGiveaway(client, giveawayId, userId) {
  const lockKey = giveawayId + ":" + userId;
  if (pendingEntries.has(lockKey)) return { ok: false, message: "Your entry is already being processed. Try again in a moment." };
  pendingEntries.add(lockKey);
  try {
    const result = await mutateGiveaways(items => {
      const giveaway = items.find(item => item.id === giveawayId);
      if (!giveaway) return { ok: false, message: "I couldn't find that giveaway." };
      if (giveaway.ended || Date.now() >= giveaway.endAt) {
        return { ok: false, message: "This giveaway has ended." };
      }
      if (giveaway.entries.includes(userId)) {
        return { ok: false, message: "You're already entered in this giveaway." };
      }
      giveaway.entries.push(userId);
      return { ok: true, message: "You're entered! Good luck.", giveaway: { ...giveaway, entries: [...giveaway.entries] } };
    });
    if (result.ok) await refreshMessage(client, result.giveaway);
    return { ok: result.ok, message: result.message };
  } finally {
    pendingEntries.delete(lockKey);
  }
}

async function finishGiveaway(client, giveawayId) {
  if (endingGiveaways.has(giveawayId)) return;
  endingGiveaways.add(giveawayId);
  try {
    const giveaway = await mutateGiveaways(items => {
      const item = items.find(entry => entry.id === giveawayId);
      if (!item || item.ended || Date.now() < item.endAt) return null;
      const pool = [...new Set(item.entries)];
      const winnerIds = [];
      const winnerCount = Math.min(item.winnersCount, pool.length);
      while (winnerIds.length < winnerCount) {
        winnerIds.push(pool.splice(randomInt(pool.length), 1)[0]);
      }
      item.ended = true;
      item.winnerIds = winnerIds;
      item.endedAt = new Date().toISOString();
      return { ...item, entries: [...item.entries], winnerIds: [...winnerIds] };
    });
    if (!giveaway) return;

    await refreshMessage(client, giveaway);
    try {
      const channel = await client.channels.fetch(giveaway.channelId);
      if (channel && typeof channel.send === "function") {
        const announcement = giveaway.winnerIds.length
          ? "🎉 Congratulations " + giveaway.winnerIds.map(id => "<@" + id + ">").join(", ") +
            "! You won **" + giveaway.prize + "**."
          : "The giveaway for **" + giveaway.prize + "** has ended, but nobody entered.";
        await channel.send({
          content: announcement,
          allowedMentions: { users: giveaway.winnerIds }
        });
      }
    } catch (error) {
      console.error("[giveaways] Could not announce winners for " + giveaway.id + ":", error.message);
    }
  } finally {
    endingGiveaways.delete(giveawayId);
  }
}

async function processDueGiveaways(client) {
  const items = await readGiveaways();
  const due = items.filter(item => !item.ended && Number(item.endAt) <= Date.now());
  for (const giveaway of due) {
    await finishGiveaway(client, giveaway.id);
  }
}

function startGiveawayScheduler(client) {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const tick = () => processDueGiveaways(client).catch(error =>
    console.error("[giveaways] Scheduler failed:", error.message)
  );
  tick();
  const timer = setInterval(tick, 15000);
  if (typeof timer.unref === "function") timer.unref();
}

module.exports = { createGiveaway, enterGiveaway, processDueGiveaways, startGiveawayScheduler };
