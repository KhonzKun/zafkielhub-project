const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require("qrcode");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");
const { attachCommandHandler } = require("./bot/handler");
const botStore = require("./bot/store");
const pkg = require("./package.json");

// ================================
// PENYIMPANAN DATA (file JSON lokal)
// ================================
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_SETTINGS = {
  stickerPackName: "xxx",
  stickerAuthorName: "xxx",
  stickerFolder: "./stickers",
  stickerDelayMs: 400,
  repeatMessage: "xxx",
  repeatDelayMs: 2000,
  repeatMaxCount: 20,
};

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

function getUsers() {
  return readJSON(USERS_FILE, { users: [] });
}

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...readJSON(SETTINGS_FILE, {}) };
}

function saveSettings(partial) {
  const current = getSettings();
  const updated = { ...current, ...partial };
  writeJSON(SETTINGS_FILE, updated);
  return updated;
}

// ================================
// STATE BOT (Baileys)
// ================================
let sock = null;
let connectionStatus = "disconnected"; // disconnected | connecting | connected
let lastPairingCode = null;
let lastQRDataUrl = null; // QR code dalam bentuk data URL (buat ditampilkan sebagai <img>)
let activityLog = []; // log sederhana buat ditampilkan di dashboard

function logActivity(text) {
  const entry = { time: new Date().toISOString(), text };
  activityLog.unshift(entry);
  activityLog = activityLog.slice(0, 50); // simpan 50 terbaru aja
  console.log(`[BOT] ${text}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, "auth")
  );
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["Dashboard Bot", "Chrome", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        lastQRDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 6 });
        logActivity("QR code baru dibuat, siap di-scan.");
      } catch (err) {
        logActivity(`Gagal generate QR: ${err.message}`);
      }
    }

    if (connection === "connecting") {
      connectionStatus = "connecting";
      logActivity("Menghubungkan ke WhatsApp...");
    } else if (connection === "open") {
      connectionStatus = "connected";
      lastPairingCode = null;
      lastQRDataUrl = null;
      logActivity("Bot berhasil terhubung ke WhatsApp \u{2705}");
    } else if (connection === "close") {
      connectionStatus = "disconnected";
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logActivity(`Koneksi terputus (${statusCode || "?"})`);

      if (shouldReconnect) {
        startBot();
      } else {
        logActivity("Logout. Hapus folder 'auth' kalau mau login ulang dari awal.");
      }
    }
  });

  // Sistem command WA (.menu, .ping, dst) - lihat folder bot/
  attachCommandHandler(sock, logActivity);
}

// Minta kode pairing (bukan QR) untuk nomor tertentu
async function requestPairingCode(phoneNumber) {
  if (!sock) throw new Error("Bot belum diinisialisasi. Restart server.");
  const cleaned = phoneNumber.replace(/[^0-9]/g, "");
  const code = await sock.requestPairingCode(cleaned);
  lastPairingCode = code;
  logActivity(`Kode pairing diminta untuk ${cleaned}: ${code}`);
  return code;
}

// Kirim 1 paket stiker (semua gambar di folder stickers) ke 1 nomor
async function sendStickerPack(targetNumber) {
  if (!sock || connectionStatus !== "connected") {
    throw new Error("Bot belum terhubung ke WhatsApp.");
  }

  const settings = getSettings();
  const folder = path.resolve(__dirname, settings.stickerFolder);
  const jid = targetNumber.includes("@")
    ? targetNumber
    : `${targetNumber}@s.whatsapp.net`;

  if (!fs.existsSync(folder)) {
    throw new Error(`Folder stiker tidak ditemukan: ${folder}`);
  }

  const files = fs
    .readdirSync(folder)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));

  if (files.length === 0) {
    throw new Error("Tidak ada gambar di folder stiker.");
  }

  logActivity(`Mengirim ${files.length} stiker ke ${targetNumber}...`);

  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(folder, files[i]);
    try {
      const sticker = new Sticker(filePath, {
        pack: settings.stickerPackName,
        author: settings.stickerAuthorName,
        type: StickerTypes.FULL,
        quality: 70,
      });
      const buffer = await sticker.toBuffer();
      await sock.sendMessage(jid, { sticker: buffer });
    } catch (err) {
      logActivity(`Gagal kirim stiker ${files[i]}: ${err.message}`);
    }
    if (i < files.length - 1) await sleep(settings.stickerDelayMs);
  }

  logActivity(`Selesai kirim paket stiker ke ${targetNumber}`);
  return files.length;
}

// Kirim teks berulang ke 1 nomor tujuan
async function sendRepeatedText(targetNumber, count) {
  if (!sock || connectionStatus !== "connected") {
    throw new Error("Bot belum terhubung ke WhatsApp.");
  }

  const settings = getSettings();
  const safeCount = Math.min(count, settings.repeatMaxCount);
  const jid = targetNumber.includes("@")
    ? targetNumber
    : `${targetNumber}@s.whatsapp.net`;

  logActivity(`Mengirim ${safeCount}x pesan ke ${targetNumber}...`);

  for (let i = 1; i <= safeCount; i++) {
    try {
      await sock.sendMessage(jid, { text: settings.repeatMessage });
    } catch (err) {
      logActivity(`Gagal kirim pesan ke-${i}: ${err.message}`);
    }
    if (i < safeCount) await sleep(settings.repeatDelayMs);
  }

  logActivity(`Selesai kirim ${safeCount} pesan ke ${targetNumber}`);
  return safeCount;
}

// ================================
// EXPRESS APP
// ================================
const app = express();
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: "zafkielhub-session-secret-key-prod",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7 days
  })
);

// Ensure avatars upload folder exists
const AVATARS_DIR = path.join(__dirname, "public", "uploads", "avatars");
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

function getCurrentUser(req) {
  if (!req.session || !req.session.username) return null;
  const data = getUsers();
  let user = null;
  if (req.session.userId) {
    user = data.users.find((u) => u.id === req.session.userId);
  }
  if (!user) {
    user = data.users.find((u) => u.username.toLowerCase() === req.session.username.toLowerCase());
  }
  return user || null;
}

function saveUserRecord(updatedUser) {
  const data = getUsers();
  const index = data.users.findIndex((u) => u.id === updatedUser.id || u.username === updatedUser.username);
  if (index !== -1) {
    data.users[index] = updatedUser;
  } else {
    data.users.push(updatedUser);
  }
  writeJSON(USERS_FILE, data);
}

function requireAuth(req, res, next) {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: "Authentication required. Please log in." });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    const role = req.user.role || "member";
    if (role !== "admin" && role !== "owner") {
      return res.status(403).json({ error: "Access denied. Admin or Owner privileges required." });
    }
    next();
  });
}

function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    const role = req.user.role || "member";
    if (role !== "owner") {
      return res.status(403).json({ error: "Access denied. Only the Owner can perform this action." });
    }
    next();
  });
}

// ---- AUTH ----

app.get("/api/auth/exists", (req, res) => {
  const { users } = getUsers();
  res.json({ exists: users.length > 0 });
});

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }
  const cleanUsername = String(username).trim();
  if (cleanUsername.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const data = getUsers();
  const exists = data.users.some(
    (u) => u.username.toLowerCase() === cleanUsername.toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ error: "Username already taken. Please choose another." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const isFirstUser = data.users.length === 0;
  const role = isFirstUser ? "owner" : "member";
  const id = "usr_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  const newUser = {
    id,
    username: cleanUsername,
    passwordHash,
    role,
    avatar: "",
    adminRequest: null,
    createdAt: new Date().toISOString(),
  };

  data.users.push(newUser);
  writeJSON(USERS_FILE, data);

  req.session.userId = newUser.id;
  req.session.username = newUser.username;
  req.session.role = newUser.role;

  logActivity(`New ${role} registered: @${newUser.username}`);

  res.json({
    ok: true,
    user: {
      id: newUser.id,
      username: newUser.username,
      role: newUser.role,
      avatar: newUser.avatar,
    },
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const data = getUsers();
  const user = data.users.find(
    (u) => u.username.toLowerCase() === String(username).trim().toLowerCase()
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  // Ensure ID and role exist
  if (!user.id) {
    user.id = "usr_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    writeJSON(USERS_FILE, data);
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role || "member";

  res.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role || "member",
      avatar: user.avatar || "",
    },
  });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new passwords are required." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }

  const match = await bcrypt.compare(currentPassword, req.user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }

  req.user.passwordHash = await bcrypt.hash(newPassword, 10);
  saveUserRecord(req.user);
  res.json({ ok: true, message: "Password successfully updated." });
});

// ---- CURRENT USER & PROFILE ----

app.get("/api/me", requireAuth, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    username: u.username,
    role: u.role || "member",
    avatar: u.avatar || "",
    adminRequest: u.adminRequest || null,
    createdAt: u.createdAt,
  });
});

app.post("/api/profile/avatar", requireAuth, async (req, res) => {
  const { avatarData, avatarUrl } = req.body || {};
  try {
    let finalUrl = avatarUrl || "";
    if (avatarData && avatarData.startsWith("data:image/")) {
      const match = avatarData.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === "jpeg" ? "jpg" : match[1];
        const base64Data = match[2];
        const fileName = `avatar_${req.user.id}_${Date.now()}.${ext}`;
        const filePath = path.join(AVATARS_DIR, fileName);
        fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
        finalUrl = `/uploads/avatars/${fileName}`;
      }
    }

    if (!finalUrl && !avatarData) {
      return res.status(400).json({ error: "No avatar image provided." });
    }

    req.user.avatar = finalUrl;
    saveUserRecord(req.user);
    res.json({ ok: true, avatar: finalUrl });
  } catch (err) {
    res.status(500).json({ error: `Failed to save avatar: ${err.message}` });
  }
});

app.post("/api/role/request-admin", requireAuth, (req, res) => {
  if (req.user.role === "owner" || req.user.role === "admin") {
    return res.status(400).json({ error: "You are already an Admin or Owner." });
  }

  req.user.adminRequest = {
    status: "pending",
    requestedAt: new Date().toISOString(),
  };
  saveUserRecord(req.user);

  logActivity(`User @${req.user.username} submitted an Admin role request (pending Owner approval).`);
  res.json({ ok: true, status: "pending", message: "Admin role request submitted to the Owner." });
});

// ---- OWNER ONLY: USER & REQUEST MANAGEMENT ----

app.get("/api/admin/users", requireOwner, (req, res) => {
  const data = getUsers();
  const sanitized = data.users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role || "member",
    avatar: u.avatar || "",
    adminRequest: u.adminRequest || null,
    createdAt: u.createdAt,
  }));
  res.json(sanitized);
});

app.post("/api/admin/users/:userId/role", requireOwner, (req, res) => {
  const { role } = req.body || {};
  const validRoles = ["owner", "admin", "premium", "member"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: "Invalid role specified." });
  }

  const data = getUsers();
  const target = data.users.find((u) => u.id === req.params.userId || u.username === req.params.userId);
  if (!target) {
    return res.status(404).json({ error: "User not found." });
  }

  const oldRole = target.role;
  target.role = role;
  if (target.adminRequest && target.adminRequest.status === "pending") {
    target.adminRequest.status = (role === "admin" || role === "owner") ? "approved" : "rejected";
    target.adminRequest.reviewedAt = new Date().toISOString();
  }

  writeJSON(USERS_FILE, data);
  logActivity(`Owner updated role for @${target.username}: ${oldRole} -> ${role}`);

  res.json({
    ok: true,
    user: {
      id: target.id,
      username: target.username,
      role: target.role,
    },
  });
});

app.post("/api/admin/requests/:userId/approve", requireOwner, (req, res) => {
  const data = getUsers();
  const target = data.users.find((u) => u.id === req.params.userId || u.username === req.params.userId);
  if (!target) {
    return res.status(404).json({ error: "User not found." });
  }

  target.role = "admin";
  target.adminRequest = {
    ...(target.adminRequest || {}),
    status: "approved",
    approvedAt: new Date().toISOString(),
  };

  writeJSON(USERS_FILE, data);
  logActivity(`Owner approved Admin promotion for @${target.username} \u{2705}`);
  res.json({ ok: true, message: `Approved Admin status for @${target.username}.` });
});

app.post("/api/admin/requests/:userId/reject", requireOwner, (req, res) => {
  const data = getUsers();
  const target = data.users.find((u) => u.id === req.params.userId || u.username === req.params.userId);
  if (!target) {
    return res.status(404).json({ error: "User not found." });
  }

  target.adminRequest = {
    ...(target.adminRequest || {}),
    status: "rejected",
    rejectedAt: new Date().toISOString(),
  };

  writeJSON(USERS_FILE, data);
  logActivity(`Owner rejected Admin request for @${target.username}.`);
  res.json({ ok: true, message: `Rejected Admin request for @${target.username}.` });
});

// ---- STATUS & LOG ----

app.get("/api/status", requireAuth, (req, res) => {
  const u = req.user;
  const bSettings = botStore.getBotSettings();
  res.json({
    userId: u.id,
    username: u.username,
    role: u.role || "member",
    avatar: u.avatar || "",
    adminRequest: u.adminRequest || null,
    connectionStatus,
    lastPairingCode,
    lastQRDataUrl,
    log: activityLog.slice(0, 20),
    botVersion: pkg.botVersion || pkg.version,
    botName: bSettings.botName,
    ownerName: bSettings.ownerName,
    ownerNumber: bSettings.ownerNumber,
    tiktokUrl: bSettings.tiktokUrl,
    telegramUrl: bSettings.telegramUrl,
  });
});

// ---- BOT SETTINGS (Bot Identity: Owner Only) ----

app.get("/api/bot-settings", requireAuth, (req, res) => {
  res.json(botStore.getBotSettings());
});

app.post("/api/bot-settings", requireOwner, (req, res) => {
  const allowedKeys = [
    "botName",
    "ownerName",
    "ownerNumber",
    "rules",
    "tiktokUrl",
    "telegramUrl",
    "dailyClaimCoin",
    "dailyClaimExp",
  ];
  const partial = {};
  for (const key of allowedKeys) {
    if (req.body[key] !== undefined) partial[key] = req.body[key];
  }
  const updated = botStore.saveBotSettings(partial);
  logActivity(`Owner updated Bot Identity configuration.`);
  res.json(updated);
});

// Public info
app.get("/api/public-info", (req, res) => {
  const s = botStore.getBotSettings();
  res.json({
    botName: s.botName,
    ownerName: s.ownerName,
    ownerNumber: s.ownerNumber,
    tiktokUrl: s.tiktokUrl,
    telegramUrl: s.telegramUrl,
    botVersion: pkg.botVersion || pkg.version,
  });
});

// ---- MEMBER (leaderboard) ----

app.get("/api/members/top", requireAuth, (req, res) => {
  const field = req.query.field === "coin" ? "coin" : "exp";
  res.json(botStore.getTopBy(field, 15));
});

// ---- MENU LIST ----
app.get("/api/menu", requireAuth, (req, res) => {
  const { MENU_CATEGORIES } = require("./bot/menu");
  res.json(MENU_CATEGORIES);
});

// ---- PAIRING ----

app.post("/api/pairing/request", requireAuth, async (req, res) => {
  const { phoneNumber } = req.body || {};
  if (!phoneNumber) {
    return res.status(400).json({ error: "Phone number is required." });
  }
  if (connectionStatus === "connected") {
    return res.status(400).json({ error: "Bot is already connected. Pairing is not needed." });
  }

  try {
    const code = await requestPairingCode(phoneNumber);
    res.json({ ok: true, code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- SETTINGS (Watermark & Delay) ----

app.get("/api/settings", requireAuth, (req, res) => {
  res.json(getSettings());
});

app.post("/api/settings", requireAdmin, (req, res) => {
  const allowedKeys = [
    "stickerPackName",
    "stickerAuthorName",
    "stickerDelayMs",
    "repeatMessage",
    "repeatDelayMs",
    "repeatMaxCount",
  ];
  const partial = {};
  for (const key of allowedKeys) {
    if (req.body[key] !== undefined) partial[key] = req.body[key];
  }
  const updated = saveSettings(partial);
  res.json(updated);
});

// ---- ACTIONS (Sticker & Repeat Text: Admin or Owner Only) ----

app.post("/api/send/sticker", requireAdmin, async (req, res) => {
  const { targetNumber } = req.body || {};
  if (!targetNumber) {
    return res.status(400).json({ error: "Destination phone number is required." });
  }
  try {
    const count = await sendStickerPack(targetNumber);
    res.json({ ok: true, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/send/text", requireAdmin, async (req, res) => {
  const { targetNumber, count } = req.body || {};
  if (!targetNumber) {
    return res.status(400).json({ error: "Destination phone number is required." });
  }
  const parsedCount = Math.max(1, parseInt(count, 10) || 1);
  try {
    const sent = await sendRepeatedText(targetNumber, parsedCount);
    res.json({ ok: true, sent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n\u{1F310} Dashboard running on http://localhost:${PORT}\n`);
});

startBot().catch((err) => console.error("Fatal error starting bot:", err));
