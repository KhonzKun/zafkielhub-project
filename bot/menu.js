const path = require("path");
const pkg = require("../package.json");
const { imageToPngBuffer } = require("./jimp-helpers");

// ================================
// SUMBER DATA MENU (dipakai bareng oleh WA .menu DAN halaman web)
// Status: "live"  -> data real / fungsi jalan penuh tanpa API key tambahan
//         "basic" -> jalan, tapi data statis/sederhana (bukan realtime)
//         "key"   -> perlu API key pihak ketiga (lihat README) baru full jalan
// ================================
const MENU_CATEGORIES = [
  {
    title: "ANIME & MANGA",
    desc: "Anime searches, character profiles, aesthetic media, and seasonal schedules",
    items: [
      { cmd: "anime", desc: "Search anime information & score", status: "live" },
      { cmd: "waifu", desc: "Random waifu image gallery", status: "live" },
      { cmd: "husbu", desc: "Random husbando image gallery", status: "live" },
      { cmd: "pinterest", desc: "Search Pinterest for aesthetic images", status: "live" },
      { cmd: "topanime", desc: "Top ranked anime list", status: "live" },
      { cmd: "topmale", desc: "Top male anime characters", status: "live" },
      { cmd: "topfemale", desc: "Top female anime characters", status: "live" },
      { cmd: "whatanime", desc: "Identify anime from screenshot", status: "live" },
      { cmd: "ongoing", desc: "Currently airing anime this season", status: "live" },
    ],
  },
  {
    title: "GAME GUIDE",
    desc: "Gaming guides, tier teams, and random gamer username generators",
    items: [
      { cmd: "gtguide", desc: "Genshin team composition guide", status: "basic" },
      { cmd: "hsrguide", desc: "Honkai: Star Rail build guide", status: "basic" },
      { cmd: "wuwaguide", desc: "Wuthering Waves starter guide", status: "basic" },
      { cmd: "genshinguide", desc: "Genshin Impact general guide", status: "basic" },
      { cmd: "endfieldguide", desc: "Arknights: Endfield guide", status: "basic" },
      { cmd: "zzzguide", desc: "Zenless Zone Zero guide", status: "basic" },
      { cmd: "baguide", desc: "Blue Archive formation guide", status: "basic" },
      { cmd: "nteguide", desc: "NIKKE team composition guide", status: "basic" },
      { cmd: "genshinakun", desc: "Genshin account estimation", status: "basic" },
      { cmd: "usernameml", desc: "Mobile Legends nickname generator", status: "live" },
      { cmd: "usernameff", desc: "Free Fire nickname generator", status: "live" },
    ],
  },
  {
    title: "INFORMATION & WEATHER",
    desc: "Real-time prayer times, earthquakes, live currency, crypto, and weather",
    items: [
      { cmd: "jadwalsholat", desc: "Prayer times by city", status: "live" },
      { cmd: "infogempa", desc: "Latest earthquake data (BMKG)", status: "live" },
      { cmd: "infokurs", desc: "Real-time foreign exchange rate", status: "live" },
      { cmd: "crypto", desc: "Real-time cryptocurrency prices", status: "live" },
      { cmd: "cuaca", desc: "Weather forecast by location", status: "live" },
    ],
  },
  {
    title: "MEDIA & SEARCH",
    desc: "YouTube search, music finder, random quotes, and trivia facts",
    items: [
      { cmd: "ytsearch", desc: "Search YouTube videos", status: "live" },
      { cmd: "play", desc: "Find YouTube music track & link", status: "live" },
      { cmd: "pinterest", desc: "Search Pinterest media", status: "live" },
      { cmd: "image", desc: "Random aesthetic photography", status: "live" },
      { cmd: "quotes", desc: "Random inspirational quote", status: "live" },
      { cmd: "fact", desc: "Random world fact trivia", status: "live" },
    ],
  },
  {
    title: "STICKER CREATOR",
    desc: "Convert image/video to WhatsApp stickers, meme text, and extraction",
    items: [
      { cmd: "sticker", desc: "Convert media to WA sticker", status: "live" },
      { cmd: "toimage", desc: "Convert WA sticker back to image", status: "live" },
      { cmd: "stickermeme", desc: "Create custom meme sticker", status: "live" },
    ],
  },
  {
    title: "UTILITIES & TOOLS",
    desc: "Math solver, text-to-speech, web screenshot, and translator",
    items: [
      { cmd: "math", desc: "Scientific calculator & formulas", status: "live" },
      { cmd: "nulis", desc: "Minimalist brat/aesthetic text card", status: "live" },
      { cmd: "lyric", desc: "Search song lyrics by title", status: "live" },
      { cmd: "ssweb", desc: "Capture website screenshot", status: "live" },
      { cmd: "mememaker", desc: "Generate meme with custom text", status: "live" },
      { cmd: "jpvoice", desc: "Japanese text-to-speech voice", status: "live" },
      { cmd: "googlevoice", desc: "Google voice audio generator", status: "live" },
      { cmd: "texttospeak", desc: "Multi-language voice generator", status: "live" },
      { cmd: "quotescard", desc: "Generate quote card image", status: "live" },
      { cmd: "iqc", desc: "Islamic quote card generator", status: "live" },
      { cmd: "translate", desc: "Multi-language text translation", status: "live" },
      { cmd: "prompter", desc: "AI art prompt generator", status: "live" },
    ],
  },
  {
    title: "BOT & ACCOUNT SYSTEM",
    desc: "User profile, rank leaderboard, daily claims, vouchers, and bot info",
    items: [
      { cmd: "info", desc: "View your user profile & avatar", status: "live" },
      { cmd: "level", desc: "Check your current level & EXP", status: "live" },
      { cmd: "globalrank", desc: "Global EXP leaderboard", status: "live" },
      { cmd: "topcoin", desc: "Top coin holders ranking", status: "live" },
      { cmd: "claim", desc: "Claim daily coins & rewards", status: "live" },
      { cmd: "setname", desc: "Change your display nickname", status: "live" },
      { cmd: "setclub", desc: "Set your clan or club name", status: "live" },
      { cmd: "shop", desc: "Browse virtual credit item shop", status: "live" },
      { cmd: "redeem", desc: "Redeem admin voucher code", status: "live" },
      { cmd: "ping", desc: "Check bot response latency", status: "live" },
      { cmd: "botinfo", desc: "Bot engine version & system stats", status: "live" },
      { cmd: "rules", desc: "Bot terms & guidelines", status: "live" },
      { cmd: "owner", desc: "Contact the bot owner", status: "live" },
      { cmd: "cekpremium", desc: "Check premium status", status: "live" },
      { cmd: "delete", desc: "Delete your user account data", status: "live" },
    ],
  },
];

function findCommandMeta(cmd) {
  for (const cat of MENU_CATEGORIES) {
    const found = cat.items.find((i) => i.cmd === cmd);
    if (found) return { ...found, category: cat.title };
  }
  return null;
}

function buildMenuCaption(botSettings, member) {
  const lines = [];
  lines.push(`「 ${botSettings.botName.toUpperCase()} 」`);
  lines.push(`Engine Version : ${pkg.botVersion || pkg.version}`);
  lines.push("");
  lines.push("╭─「 USER INFO 」");
  lines.push(`│ Nama     : ${member.name}`);
  lines.push(`│ Limit    : ${member.premium ? "Unlimited" : member.limit}`);
  lines.push(`│ Level    : ${member.level}`);
  lines.push(`│ Premium  : ${member.premium ? "Ya" : "Tidak"}`);
  lines.push(`│ Group    : ${member.group}`);
  lines.push(`│ Club     : ${member.club}`);
  lines.push("╰────────────────");
  lines.push("");

  for (const cat of MENU_CATEGORIES) {
    lines.push(`╭─「 ${cat.title} 」`);
    for (const item of cat.items) {
      const lockTag = item.status === "key" ? " \u{26BF}" : "";
      lines.push(`│ • ${botSettings.prefixes[0]}${item.cmd}${lockTag}`);
    }
    lines.push("╰────────────────");
  }

  lines.push("");
  lines.push(`Ketik ${botSettings.prefixes[0]}menu untuk melihat menu.`);
  return lines.join("\n");
}

// Kirim foto MENU apa adanya (tanpa proses/olah gambar sama sekali) - biar
// gampang diganti: tinggal timpa file public/assets/menu-photo.jpg atau
// public/assets/menu-photo.png pakai foto kamu sendiri, nama file HARUS sama.
// Info bot/user tetap muncul, tapi lewat caption teks di bawah foto (bukan
// ditulis nimpa fotonya) - lihat buildMenuCaption().
async function buildMenuBanner() {
  const assetsDir = path.join(__dirname, "..", "public", "assets");
  const candidates = ["menu-photo.jpg", "menu-photo.jpeg", "menu-photo.png", "menu-photo.webp", "menu-banner-bg.png"];
  const fs = require("fs");
  for (const name of candidates) {
    const p = path.join(assetsDir, name);
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  // Fallback terakhir kalau nggak ada file foto sama sekali
  const { newCanvas } = require("./jimp-helpers");
  const img = newCanvas(800, 420, 0x1a0b22ff);
  return imageToPngBuffer(img);
}

module.exports = { MENU_CATEGORIES, findCommandMeta, buildMenuCaption, buildMenuBanner };
