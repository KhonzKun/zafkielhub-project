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
      logActivity("Bot berhasil terhubung ke WhatsApp ✅");
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
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: "ganti-string-ini-dengan-yang-lebih-acak-di-produksi",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7 hari
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.username) return next();
  return res.status(401).json({ error: "Belum login." });
}

// ---- AUTH ----

// Cek apakah sudah ada akun terdaftar (buat nentuin tampilkan Login vs Register)
app.get("/api/auth/exists", (req, res) => {
  const { users } = getUsers();
  res.json({ exists: users.length > 0 });
});

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password minimal 6 karakter." });
  }

  const data = getUsers();
  if (data.users.length > 0) {
    return res
      .status(403)
      .json({ error: "Akun admin sudah ada. Silakan login." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  data.users.push({ username, passwordHash });
  writeJSON(USERS_FILE, data);

  req.session.username = username;
  res.json({ ok: true, username });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  const data = getUsers();
  const user = data.users.find((u) => u.username === username);

  if (!user) {
    return res.status(401).json({ error: "Username atau password salah." });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: "Username atau password salah." });
  }

  req.session.username = username;
  res.json({ ok: true, username });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Password lama dan baru wajib diisi." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Password baru minimal 6 karakter." });
  }

  const data = getUsers();
  const user = data.users.find((u) => u.username === req.session.username);
  if (!user) {
    return res.status(404).json({ error: "Akun tidak ditemukan." });
  }

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: "Password saat ini salah." });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  writeJSON(USERS_FILE, data);
  res.json({ ok: true });
});

// ---- STATUS & LOG ----

app.get("/api/status", requireAuth, (req, res) => {
  res.json({
    username: req.session.username,
    connectionStatus,
    lastPairingCode,
    lastQRDataUrl,
    log: activityLog.slice(0, 15),
    botVersion: pkg.botVersion || pkg.version,
    botName: botStore.getBotSettings().botName,
  });
});

// ---- BOT SETTINGS (nama bot, owner, tombol TikTok/Telegram, rules) ----

app.get("/api/bot-settings", requireAuth, (req, res) => {
  res.json(botStore.getBotSettings());
});

app.post("/api/bot-settings", requireAuth, (req, res) => {
  const allowedKeys = ["botName", "ownerName", "ownerNumber", "rules", "tiktokUrl", "telegramUrl", "dailyClaimCoin", "dailyClaimExp"];
  const partial = {};
  for (const key of allowedKeys) {
    if (req.body[key] !== undefined) partial[key] = req.body[key];
  }
  res.json(botStore.saveBotSettings(partial));
});

// Publik (dipakai halaman login buat nampilin tombol TikTok/Telegram developer,
// tanpa perlu login dulu)
app.get("/api/public-info", (req, res) => {
  const s = botStore.getBotSettings();
  res.json({
    botName: s.botName,
    tiktokUrl: s.tiktokUrl,
    telegramUrl: s.telegramUrl,
    botVersion: pkg.botVersion || pkg.version,
  });
});

// ---- MEMBER (leaderboard, dsb - buat ditampilkan di dashboard kalau perlu) ----

app.get("/api/members/top", requireAuth, (req, res) => {
  const field = req.query.field === "coin" ? "coin" : "exp";
  res.json(botStore.getTopBy(field, 15));
});

// ---- DAFTAR MENU (dipakai halaman "Menu Bot" buat nampilin daftar command) ----
app.get("/api/menu", requireAuth, (req, res) => {
  const { MENU_CATEGORIES } = require("./bot/menu");
  res.json(MENU_CATEGORIES);
});

// ---- PAIRING ----

app.post("/api/pairing/request", requireAuth, async (req, res) => {
  const { phoneNumber } = req.body || {};
  if (!phoneNumber) {
    return res.status(400).json({ error: "Nomor HP wajib diisi." });
  }
  if (connectionStatus === "connected") {
    return res.status(400).json({ error: "Bot sudah terhubung. Tidak perlu pairing lagi." });
  }

  try {
    const code = await requestPairingCode(phoneNumber);
    res.json({ ok: true, code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- SETTINGS (Menu Bot) ----

app.get("/api/settings", requireAuth, (req, res) => {
  res.json(getSettings());
});

app.post("/api/settings", requireAuth, (req, res) => {
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

// ---- AKSI KIRIM (Menu Bot) ----

app.post("/api/send/sticker", requireAuth, async (req, res) => {
  const { targetNumber } = req.body || {};
  if (!targetNumber) {
    return res.status(400).json({ error: "Nomor tujuan wajib diisi." });
  }
  try {
    const count = await sendStickerPack(targetNumber);
    res.json({ ok: true, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/send/text", requireAuth, async (req, res) => {
  const { targetNumber, count } = req.body || {};
  if (!targetNumber) {
    return res.status(400).json({ error: "Nomor tujuan wajib diisi." });
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
  console.log(`\n🌐 Dashboard jalan di http://localhost:${PORT}\n`);
});

startBot().catch((err) => console.error("Fatal error saat start bot:", err));
