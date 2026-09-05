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
    items: [
      { cmd: "anime", desc: "Cari info anime", status: "live" },
      { cmd: "waifu", desc: "Gambar waifu (Pinterest)", status: "live" },
      { cmd: "husbu", desc: "Gambar husbando (Pinterest)", status: "live" },
      { cmd: "pinterest", desc: "Cari gambar anime/apapun di Pinterest", status: "live" },
      { cmd: "topanime", desc: "Ranking anime terpopuler", status: "live" },
      { cmd: "topmale", desc: "Karakter anime pria top", status: "live" },
      { cmd: "topfemale", desc: "Karakter anime wanita top", status: "live" },
      { cmd: "whatanime", desc: "Tebak anime dari screenshot", status: "live" },
      { cmd: "ongoing", desc: "Anime tayang musim ini", status: "live" },
    ],
  },
  {
    title: "GAME GUIDE",
    items: [
      { cmd: "gtguide", desc: "Panduan Genshin Team", status: "basic" },
      { cmd: "hsrguide", desc: "Panduan Honkai Star Rail", status: "basic" },
      { cmd: "wuwaguide", desc: "Panduan Wuthering Waves", status: "basic" },
      { cmd: "genshinguide", desc: "Panduan Genshin Impact", status: "basic" },
      { cmd: "endfieldguide", desc: "Panduan Arknights Endfield", status: "basic" },
      { cmd: "zzzguide", desc: "Panduan Zenless Zone Zero", status: "basic" },
      { cmd: "baguide", desc: "Panduan Blue Archive", status: "basic" },
      { cmd: "nteguide", desc: "Panduan Nikke", status: "basic" },
      { cmd: "genshinakun", desc: "Cek estimasi akun Genshin", status: "basic" },
      { cmd: "usernameml", desc: "Generator nickname ML", status: "live" },
      { cmd: "usernameff", desc: "Generator nickname FF", status: "live" },
    ],
  },
  {
    title: "INFORMASI",
    items: [
      { cmd: "jadwalsholat", desc: "Jadwal sholat per kota", status: "live" },
      { cmd: "infogempa", desc: "Info gempa terbaru (BMKG)", status: "live" },
      { cmd: "infokurs", desc: "Kurs mata uang realtime", status: "live" },
      { cmd: "crypto", desc: "Harga crypto realtime", status: "live" },
      { cmd: "cuaca", desc: "Prakiraan cuaca kota", status: "live" },
    ],
  },
  {
    title: "SEARCH",
    items: [
      { cmd: "ytsearch", desc: "Cari video YouTube", status: "live" },
      { cmd: "play", desc: "Cari lagu YouTube (judul+link)", status: "live" },
      { cmd: "pinterest", desc: "Cari gambar Pinterest", status: "live" },
      { cmd: "image", desc: "Cari gambar visual", status: "live" },
      { cmd: "quotes", desc: "Kutipan motivasi random", status: "live" },
      { cmd: "fact", desc: "Fakta unik dunia", status: "live" },
    ],
  },
  {
    title: "STICKER MAKER",
    items: [
      { cmd: "sticker", desc: "Gambar/video ke stiker WA", status: "live" },
      { cmd: "toimage", desc: "Stiker WA ke gambar", status: "live" },
      { cmd: "stickermeme", desc: "Stiker + teks meme", status: "live" },
    ],
  },
  {
    title: "UTILITAS & TOOLS",
    items: [
      { cmd: "math", desc: "Kalkulator & rumus matematika", status: "live" },
      { cmd: "nulis", desc: "Teks jadi gambar tulisan", status: "live" },
      { cmd: "lyric", desc: "Cari lirik lagu", status: "live" },
      { cmd: "ssweb", desc: "Screenshot website", status: "live" },
      { cmd: "mememaker", desc: "Bikin meme dari template", status: "live" },
      { cmd: "jpvoice", desc: "Text-to-speech bahasa Jepang", status: "live" },
      { cmd: "googlevoice", desc: "Text-to-speech Google (ID)", status: "live" },
      { cmd: "texttospeak", desc: "Ubah teks jadi suara", status: "live" },
      { cmd: "quotescard", desc: "Kutipan jadi kartu gambar", status: "live" },
      { cmd: "iqc", desc: "Islamic quote card", status: "live" },
      { cmd: "translate", desc: "Terjemahkan bahasa", status: "live" },
      { cmd: "prompter", desc: "Generator ide prompt seni", status: "live" },
    ],
  },
  {
    title: "MENU BOT & USER",
    items: [
      { cmd: "info", desc: "Info profil akun kamu", status: "live" },
      { cmd: "level", desc: "Cek level & exp kamu", status: "live" },
      { cmd: "globalrank", desc: "Ranking exp semua user", status: "live" },
      { cmd: "topcoin", desc: "Ranking coin terbanyak", status: "live" },
      { cmd: "claim", desc: "Klaim coin harian", status: "live" },
      { cmd: "setname", desc: "Ganti nama panggilan", status: "live" },
      { cmd: "setclub", desc: "Atur clan/club kamu", status: "live" },
      { cmd: "shop", desc: "Lihat toko item virtual", status: "live" },
      { cmd: "redeem", desc: "Tukar kode voucher", status: "live" },
      { cmd: "ping", desc: "Cek kecepatan respon bot", status: "live" },
      { cmd: "botinfo", desc: "Info lengkap sistem bot", status: "live" },
      { cmd: "rules", desc: "Peraturan pakai bot", status: "live" },
      { cmd: "owner", desc: "Kontak owner bot", status: "live" },
      { cmd: "cekpremium", desc: "Cek status akun", status: "live" },
      { cmd: "delete", desc: "Hapus data akun kamu", status: "live" },
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
      const lockTag = item.status === "key" ? " ⚿" : "";
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
