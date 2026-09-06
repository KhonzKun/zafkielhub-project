const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const MEMBERS_FILE = path.join(DATA_DIR, "members.json");
const VOUCHERS_FILE = path.join(DATA_DIR, "vouchers.json");
const BOTSETTINGS_FILE = path.join(DATA_DIR, "bot-settings.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

const DEFAULT_BOT_SETTINGS = {
  botName: "ZafkielHub",
  ownerName: "Japz",
  ownerNumber: "6281973869349",
  prefixes: [".", "!", "/"],
  rules:
    "1. Dilarang spam command.\n2. Dilarang toxic ke member lain.\n3. Gunakan bot dengan bijak, Waktu itu berharga~",
  dailyClaimCoin: 50,
  dailyClaimExp: 20,
  expPerCommand: 3,
  tiktokUrl: "https://www.tiktok.com/@zafkielxkurumi",
  telegramUrl: "https://t.me/JapzkiBW",
};

function getBotSettings() {
  return { ...DEFAULT_BOT_SETTINGS, ...readJSON(BOTSETTINGS_FILE, {}) };
}

function saveBotSettings(partial) {
  const updated = { ...getBotSettings(), ...partial };
  writeJSON(BOTSETTINGS_FILE, updated);
  return updated;
}

function getMembersRaw() {
  return readJSON(MEMBERS_FILE, {});
}

function saveMembersRaw(data) {
  writeJSON(MEMBERS_FILE, data);
}

function levelFromExp(exp) {
  return Math.floor(0.15 * Math.sqrt(exp)) + 1;
}

function getMember(jid, pushName) {
  const members = getMembersRaw();
  if (!members[jid]) {
    members[jid] = {
      jid,
      name: pushName || "Member",
      exp: 0,
      coin: 0,
      limit: 15,
      premium: false,
      group: "Regular",
      club: "-",
      language: "id",
      registeredAt: new Date().toISOString(),
      lastClaim: null,
      lastCommandAt: null,
    };
    saveMembersRaw(members);
  } else if (pushName && members[jid].name === "Member") {
    members[jid].name = pushName;
    saveMembersRaw(members);
  }
  return members[jid];
}

function updateMember(jid, partial) {
  const members = getMembersRaw();
  if (!members[jid]) getMember(jid);
  const fresh = getMembersRaw();
  fresh[jid] = { ...fresh[jid], ...partial };
  saveMembersRaw(fresh);
  return fresh[jid];
}

function addExpCoin(jid, exp = 0, coin = 0) {
  const members = getMembersRaw();
  const m = members[jid] || getMember(jid);
  m.exp = (m.exp || 0) + exp;
  m.coin = (m.coin || 0) + coin;
  members[jid] = m;
  saveMembersRaw(members);
  return m;
}

function consumeLimit(jid, amount = 1) {
  const members = getMembersRaw();
  const m = members[jid] || getMember(jid);
  if (!m.premium && m.limit < amount) return false;
  if (!m.premium) m.limit -= amount;
  members[jid] = m;
  saveMembersRaw(members);
  return true;
}

function getTopBy(field, limit = 10) {
  const members = getMembersRaw();
  return Object.values(members)
    .sort((a, b) => (b[field] || 0) - (a[field] || 0))
    .slice(0, limit);
}

function getVouchers() {
  return readJSON(VOUCHERS_FILE, {});
}

function saveVouchers(data) {
  writeJSON(VOUCHERS_FILE, data);
}

function redeemVoucher(code, jid) {
  const vouchers = getVouchers();
  const v = vouchers[code.toUpperCase()];
  if (!v) return { ok: false, error: "Kode voucher tidak ditemukan." };
  if (v.usedBy && v.usedBy.includes(jid)) {
    return { ok: false, error: "Kamu sudah pernah pakai voucher ini." };
  }
  if (v.maxUse && (v.usedBy || []).length >= v.maxUse) {
    return { ok: false, error: "Voucher ini sudah habis dipakai." };
  }
  v.usedBy = [...(v.usedBy || []), jid];
  vouchers[code.toUpperCase()] = v;
  saveVouchers(vouchers);

  const updates = {};
  if (v.coin) updates.coin = (getMember(jid).coin || 0) + v.coin;
  if (v.limit) updates.limit = (getMember(jid).limit || 0) + v.limit;
  if (v.premium) updates.premium = true;
  if (Object.keys(updates).length) updateMember(jid, updates);

  return { ok: true, voucher: v };
}

module.exports = {
  levelFromExp,
  getMember,
  updateMember,
  addExpCoin,
  consumeLimit,
  getTopBy,
  getMembersRaw,
  getVouchers,
  saveVouchers,
  redeemVoucher,
  getBotSettings,
  saveBotSettings,
};
