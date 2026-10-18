const fs = require("node:fs/promises");
const path = require("node:path");

const directory = path.resolve(process.env.DATA_DIR || "data");
const warningsFile = path.join(directory, "warnings.json");
const schedulesFile = path.join(directory, "scheduled-streams.json");

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(directory, { recursive: true });
  const temp = file + ".tmp";
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(temp, file);
}

async function getWarnings() {
  const data = await readJson(warningsFile, []);
  return Array.isArray(data) ? data : [];
}

async function addWarning(data) {
  const all = await getWarnings();
  const caseId = all.reduce((max, item) => Math.max(max, Number(item.caseId) || 0), 0) + 1;
  const record = { ...data, caseId, createdAt: new Date().toISOString() };
  all.push(record);
  await writeJson(warningsFile, all);
  return record;
}

async function removeWarning(guildId, caseId) {
  const all = await getWarnings();
  const index = all.findIndex(item => item.guildId === guildId && Number(item.caseId) === Number(caseId));
  if (index < 0) return null;
  const removed = all.splice(index, 1)[0];
  await writeJson(warningsFile, all);
  return removed;
}

async function getSchedules() {
  const data = await readJson(schedulesFile, []);
  return Array.isArray(data) ? data : [];
}

async function saveSchedules(items) {
  return writeJson(schedulesFile, items);
}

module.exports = { getWarnings, addWarning, removeWarning, getSchedules, saveSchedules };
