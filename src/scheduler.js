const { DateTime, IANAZone } = require("luxon");
const { getSchedules, saveSchedules } = require("./store");
const { makeStreamAnnouncement } = require("./streams");

const DEFAULT_TIMEZONE = process.env.TIMEZONE || "Europe/Riga";
let processing = false;

function parseLocalDateTime(date, time, zone) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || !/^[0-9]{2}:[0-9]{2}$/.test(time)) return null;
  if (!IANAZone.isValidZone(zone)) return null;
  const parsed = DateTime.fromFormat(date + " " + time, "yyyy-MM-dd HH:mm", { zone, setZone: true });
  if (!parsed.isValid || parsed.toFormat("yyyy-MM-dd HH:mm") !== date + " " + time) return null;
  return parsed;
}

async function scheduleStream(schedule) {
  const all = await getSchedules();
  all.push(schedule);
  await saveSchedules(all);
  return schedule;
}

async function listSchedules(guildId) {
  const all = await getSchedules();
  return all.filter(item => item.guildId === guildId)
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
}

async function cancelSchedule(guildId, id) {
  const all = await getSchedules();
  const index = all.findIndex(item => item.guildId === guildId && item.id === id);
  if (index < 0) return null;
  const removed = all.splice(index, 1)[0];
  await saveSchedules(all);
  return removed;
}

async function processDueSchedules(client) {
  if (processing) return;
  processing = true;
  try {
    const now = Date.now();
    const all = await getSchedules();
    const keep = [];
    for (const item of all) {
      const dueAt = new Date(item.scheduledFor).getTime();
      if (!Number.isFinite(dueAt) || dueAt > now) {
        keep.push(item);
        continue;
      }
      try {
        const channel = await client.channels.fetch(item.channelId);
        if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
          throw new Error("Scheduled channel is unavailable.");
        }
        const epoch = Math.floor(dueAt / 1000);
        await channel.send(makeStreamAnnouncement(item.streamer, item.note, epoch));
        console.log("[scheduler] Posted schedule " + item.id);
      } catch (error) {
        console.error("[scheduler] Could not post " + item.id + ": " + error.message);
        // Retry temporary delivery failures for at most one hour after the intended time.
        if (now - dueAt < 60 * 60 * 1000) keep.push(item);
      }
    }
    await saveSchedules(keep);
  } catch (error) {
    console.error("[scheduler] Failed to process schedules:", error);
  } finally {
    processing = false;
  }
}

function startScheduler(client) {
  processDueSchedules(client).catch(error => console.error("[scheduler]", error));
  setInterval(() => processDueSchedules(client).catch(error => console.error("[scheduler]", error)), 15000);
}

module.exports = { DEFAULT_TIMEZONE, parseLocalDateTime, scheduleStream, listSchedules, cancelSchedule, startScheduler };
