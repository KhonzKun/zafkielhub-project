const os = require("os");
const math = require("mathjs");
const yts = require("yt-search");
const pkg = require("../package.json");
const store = require("./store");
const { getQuoted, downloadImage, jidToNumber, searchPinterest } = require("./utils");
const { imageToPngBuffer, safeFont, safePrint, safeResize, newCanvas, readImage } = require("./jimp-helpers");

const BOT_START = Date.now();

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}j ${m}m ${sec}d`;
}

// Pesan standar buat fitur yang butuh API key pihak ketiga
function premiumStub(featureName, envVarHint) {
  return async (ctx) => {
    await ctx.reply(
      `⚿ *${featureName}* butuh API key pihak ketiga yang belum di-set admin.\n\n` +
        `Admin bisa set variabel environment *${envVarHint}* di file .env, lalu restart bot.\n` +
        `Lihat README.md bagian "Fitur yang butuh API key" untuk daftar lengkap & link penyedia API-nya.`
    );
  };
}

function staticGuide(title, body) {
  return async (ctx) => {
    await ctx.reply(`[INFO] *${title}*\n\n${body}`);
  };
}

async function safeFetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const COMMANDS = {};

// ---------- MENU BOT ----------
COMMANDS.setclub = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .setclub Zafkiel Clan");
  store.updateMember(ctx.sender, { club: ctx.text });
  await ctx.reply(`[OK] Club kamu sekarang: *${ctx.text}*`);
};

COMMANDS.shop = async (ctx) => {
  const items = [
    { name: "Limit +10", price: 30 },
    { name: "Limit +50", price: 120 },
    { name: "Ganti Nama Bebas", price: 15 },
    { name: "Badge Club Custom", price: 25 },
  ];
  const list = items.map((i) => `• ${i.name} — ${i.price} coin`).join("\n");
  await ctx.reply(`*SHOP*\n${list}\n\nBeli lewat: .redeem (pakai kode dari admin) atau .buycredit`);
};

COMMANDS.botinfo = async (ctx) => {
  await ctx.reply(
    `*${ctx.botSettings.botName}*\n` +
      `Versi: ${pkg.botVersion || pkg.version}\n` +
      `Uptime: ${formatUptime(Date.now() - BOT_START)}\n` +
      `Node: ${process.version}\n` +
      `Platform: ${os.platform()}\n` +
      `Prefix: ${ctx.botSettings.prefixes.join(" ")}\n\n` +
      `Sebagian fitur AI/edit gambar butuh API key pihak ketiga yang di-set admin lewat file .env.`
  );
};

COMMANDS.rules = async (ctx) => {
  await ctx.reply(`*RULES*\n\n${ctx.botSettings.rules}`);
};

COMMANDS.delete = async (ctx) => {
  const members = store.getMembersRaw();
  delete members[ctx.sender];
  require("fs").writeFileSync(
    require("path").join(__dirname, "..", "data", "members.json"),
    JSON.stringify(members, null, 2)
  );
  await ctx.reply("[OK] Data akun kamu di bot ini sudah dihapus.");
};

COMMANDS.level = async (ctx) => {
  const lvl = store.levelFromExp(ctx.member.exp);
  await ctx.reply(`Level: *${lvl}*\nExp: ${ctx.member.exp}\nCoin: ${ctx.member.coin}`);
};

COMMANDS.globalrank = async (ctx) => {
  const top = store.getTopBy("exp", 10);
  if (!top.length) return ctx.reply("Belum ada data member.");
  const list = top
    .map((m, i) => `${i + 1}. ${m.name} — ${m.exp} exp (Lv.${store.levelFromExp(m.exp)})`)
    .join("\n");
  await ctx.reply(`*GLOBAL RANK (EXP)*\n${list}`);
};

COMMANDS.topcoin = async (ctx) => {
  const top = store.getTopBy("coin", 10);
  if (!top.length) return ctx.reply("Belum ada data member.");
  const list = top.map((m, i) => `${i + 1}. ${m.name} — ${m.coin} coin`).join("\n");
  await ctx.reply(`*TOP COIN*\n${list}`);
};

COMMANDS.setname = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .setname Kurumi");
  store.updateMember(ctx.sender, { name: ctx.text });
  await ctx.reply(`[OK] Nama panggilan kamu sekarang: *${ctx.text}*`);
};

COMMANDS.info = async (ctx) => {
  let targetJid = ctx.sender;
  const quoted = getQuoted(ctx.msg);
  const mentioned = ctx.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;

  if (mentioned && mentioned.length > 0) {
    targetJid = mentioned[0];
  } else if (quoted?.key?.participant) {
    targetJid = quoted.key.participant;
  } else if (quoted?.key?.remoteJid && !quoted.key.remoteJid.endsWith("@g.us")) {
    targetJid = quoted.key.remoteJid;
  }

  const m = targetJid === ctx.sender ? ctx.member : store.getMember(targetJid);
  const level = store.levelFromExp(m.exp || 0);
  const userNum = jidToNumber(targetJid);
  const isTargetOwner = userNum === ctx.botSettings.ownerNumber;

  const caption =
    `╭─「 USER PROFILE 」\n` +
    `│ Nama       : ${m.name || "Member"}\n` +
    `│ Nomor      : ${userNum}\n` +
    `│ Level      : ${level} (${m.exp || 0} EXP)\n` +
    `│ Coin       : ${m.coin || 0}\n` +
    `│ Limit      : ${m.premium ? "Unlimited" : (m.limit ?? 0)}\n` +
    `│ Status     : ${isTargetOwner ? "Owner Bot" : m.premium ? "Premium" : "Regular"}\n` +
    `│ Club       : ${m.club || "-"}\n` +
    `│ Bergabung  : ${m.registeredAt ? new Date(m.registeredAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-"}\n` +
    `╰────────────────`;

  let ppUrl = null;
  if (ctx.sock?.profilePictureUrl) {
    try {
      ppUrl = await ctx.sock.profilePictureUrl(targetJid, "image");
    } catch {
      try {
        ppUrl = await ctx.sock.profilePictureUrl(targetJid, "preview");
      } catch {
        ppUrl = null;
      }
    }
  }

  if (!ppUrl) {
    ppUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name || "User")}&background=1e1b2e&color=f43f5e&size=512&bold=true`;
  }

  try {
    await ctx.replyImageUrl(ppUrl, caption);
  } catch {
    await ctx.reply(caption);
  }
};

COMMANDS.owner = async (ctx) => {
  await ctx.reply(
    `👑 *Owner Bot*\n${ctx.botSettings.ownerName}\nwa.me/${ctx.botSettings.ownerNumber}\n\n` +
      `Laporkan error/bug lewat tombol "Lapor Error" di dashboard web ya~`
  );
};

COMMANDS.ping = async (ctx) => {
  const start = Date.now();
  await ctx.reply("🏓 Pong!");
  const took = Date.now() - start;
  await ctx.reply(`Kecepatan respon: ${took}ms`);
};

COMMANDS.cekpremium = async (ctx) => {
  await ctx.reply(
    ctx.member.premium
      ? "✅ Kamu sudah *Premium*. Limit unlimited!"
      : "❌ Kamu belum premium. Ketik .buypremium buat info upgrade."
  );
};

COMMANDS.buypremium = async (ctx) => {
  await ctx.reply(
    `💎 *Upgrade Premium*\nHubungi owner: wa.me/${ctx.botSettings.ownerNumber}\nAtau tukar kode dari admin lewat .redeem <kode>`
  );
};

COMMANDS.buycredit = async (ctx) => {
  await ctx.reply(
    `🪙 *Beli Credit/Limit*\nHubungi owner: wa.me/${ctx.botSettings.ownerNumber}\nAtau tukar kode dari admin lewat .redeem <kode>`
  );
};

COMMANDS.claim = async (ctx) => {
  const now = new Date();
  const last = ctx.member.lastClaim ? new Date(ctx.member.lastClaim) : null;
  if (last && now.toDateString() === last.toDateString()) {
    return ctx.reply("⏳ Kamu udah klaim hari ini. Coba lagi besok ya!");
  }
  store.addExpCoin(ctx.sender, ctx.botSettings.dailyClaimExp, ctx.botSettings.dailyClaimCoin);
  store.updateMember(ctx.sender, { lastClaim: now.toISOString() });
  await ctx.reply(
    `🎁 Klaim harian berhasil!\n+${ctx.botSettings.dailyClaimCoin} coin\n+${ctx.botSettings.dailyClaimExp} exp`
  );
};

COMMANDS.redeem = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .redeem KODEVOUCHER");
  const result = store.redeemVoucher(ctx.text, ctx.sender);
  if (!result.ok) return ctx.reply(`❌ ${result.error}`);
  await ctx.reply(`✅ Voucher berhasil dipakai!`);
};

// Khusus owner: tambah limit member langsung tanpa voucher.
// Contoh: .addlimit 6281234567890 50
COMMANDS.addlimit = async (ctx) => {
  if (!ctx.isOwner) return ctx.reply("⛔ Command ini cuma buat owner bot.");
  const [target, amountStr] = ctx.args;
  const amount = parseInt(amountStr, 10);
  if (!target || !amount || amount <= 0) {
    return ctx.reply("Contoh: .addlimit 6281234567890 50");
  }
  const targetJid = target.includes("@") ? target : `${target.replace(/\D/g, "")}@s.whatsapp.net`;
  const targetMember = store.getMember(targetJid);
  const updated = store.updateMember(targetJid, { limit: (targetMember.limit || 0) + amount });
  await ctx.reply(`✅ Limit ${target} ditambah ${amount}.\nLimit sekarang: ${updated.premium ? "∞ (premium)" : updated.limit}`);
};

// Khusus owner: set status premium member (unlimited limit).
// Contoh: .setpremium 6281234567890 on   /   .setpremium 6281234567890 off
COMMANDS.setpremium = async (ctx) => {
  if (!ctx.isOwner) return ctx.reply("⛔ Command ini cuma buat owner bot.");
  const [target, mode] = ctx.args;
  if (!target || !["on", "off"].includes((mode || "").toLowerCase())) {
    return ctx.reply("Contoh: .setpremium 6281234567890 on");
  }
  const targetJid = target.includes("@") ? target : `${target.replace(/\D/g, "")}@s.whatsapp.net`;
  store.getMember(targetJid);
  store.updateMember(targetJid, { premium: mode.toLowerCase() === "on" });
  await ctx.reply(`✅ Status premium ${target} sekarang: ${mode.toLowerCase() === "on" ? "Aktif ✅" : "Nonaktif ❌"}`);
};

// ---------- MENU LAINNYA ----------
COMMANDS.language = async (ctx) => {
  const lang = (ctx.args[0] || "").toLowerCase();
  if (!["id", "en"].includes(lang)) return ctx.reply("Pilih bahasa: .language id  atau  .language en");
  store.updateMember(ctx.sender, { language: lang });
  await ctx.reply(`✅ Bahasa diubah ke: ${lang}`);
};
COMMANDS.menugrup = staticGuide(
  "Menu Grup",
  "Fitur khusus grup (welcome, antilink, dll) bisa ditambah nanti - saat ini belum diaktifkan."
);
COMMANDS.menugame = staticGuide("Menu Game", "Lihat kategori GAME GUIDE di .menu untuk panduan game.");
COMMANDS.download = staticGuide(
  "Menu Download",
  "Pakai .play <judul lagu> buat cari link YouTube, atau .ytsearch <kata kunci>."
);

// ---------- AI ASSISTANT ----------
COMMANDS.ai = premiumStub("AI Chat", "OPENAI_API_KEY / AI_API_KEY");
COMMANDS.ask = premiumStub("Ask AI", "OPENAI_API_KEY / AI_API_KEY");
COMMANDS.assistant = premiumStub("AI Assistant", "OPENAI_API_KEY / AI_API_KEY");
COMMANDS.rpstyle = premiumStub("AI Roleplay", "OPENAI_API_KEY / AI_API_KEY");
COMMANDS.qwen = premiumStub("Qwen Chat", "QWEN_API_KEY");
COMMANDS.deepseek = premiumStub("DeepSeek Chat", "DEEPSEEK_API_KEY");

const sessionPrefs = {};
COMMANDS.setmodel = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .setmodel gpt-4o-mini");
  sessionPrefs[ctx.sender] = { ...(sessionPrefs[ctx.sender] || {}), model: ctx.text };
  await ctx.reply(`✅ Model AI diset ke: ${ctx.text} (aktif kalau admin sudah pasang API key AI)`);
};
COMMANDS.resetsesi = async (ctx) => {
  delete sessionPrefs[ctx.sender];
  await ctx.reply("♻️ Sesi chat AI kamu direset.");
};
COMMANDS.revertsesi = async (ctx) => {
  await ctx.reply("↩️ Pesan terakhir di sesi AI kamu dihapus (kalau ada riwayat aktif).");
};

// ---------- AI TOOLS ----------
COMMANDS.gemini = premiumStub("Gemini Chat", "GEMINI_API_KEY");
COMMANDS.vision = premiumStub("AI Vision", "OPENAI_API_KEY (vision-capable model)");
COMMANDS.solver = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .solver 2x + 4 = 10  atau  .solver sqrt(144)+5*2");
  try {
    const result = math.evaluate(ctx.text.replace(/=.*/, ""));
    await ctx.reply(`🧮 Hasil: ${result}`);
  } catch {
    await ctx.reply("❌ Nggak bisa hitung ekspresi itu. Coba pakai format matematika standar ya.");
  }
};

// ---------- STICKER MAKER ----------
COMMANDS.sticker = async (ctx) => {
  const hasMedia = ctx.msg.message?.imageMessage || ctx.msg.message?.videoMessage || getQuoted(ctx.msg)?.message?.imageMessage || getQuoted(ctx.msg)?.message?.videoMessage;
  if (!hasMedia) return ctx.reply("Kirim/reply gambar atau video pendek dengan caption .sticker");
  await ctx.makeSticker();
};
COMMANDS.toimage = async (ctx) => {
  const quoted = getQuoted(ctx.msg);
  const stickerMsg = ctx.msg.message?.stickerMessage || quoted?.message?.stickerMessage;
  if (!stickerMsg) return ctx.reply("Reply stiker dengan caption .toimage");
  await ctx.stickerToImage();
};
COMMANDS.lottie = premiumStub("Lottie Sticker", "Butuh converter lottie eksternal (belum di-set)");
COMMANDS.stickermeme = async (ctx) => {
  const img = await downloadImage(ctx.msg);
  if (!img) return ctx.reply("Reply/kirim gambar + caption: .stickermeme teks atas | teks bawah");
  const [top = "", bottom = ""] = ctx.text.split("|").map((s) => s.trim());
  const image = await readImage(img);
  await safeResize(image, 512, 512);
  const font = await safeFont("SANS_32_WHITE");
  if (top) await safePrint(image, font, 20, 10, top);
  if (bottom) await safePrint(image, font, 20, 460, bottom);
  const buffer = await imageToPngBuffer(image);
  await ctx.replyStickerFromBuffer(buffer);
};
COMMANDS.stickernobg = premiumStub("Stiker Tanpa Background", "REMOVEBG_API_KEY");

// ---------- AI PROCESSING ----------
COMMANDS.tofigure = premiumStub("AI Action Figure", "AI_IMAGE_API_KEY");
COMMANDS.aiedit = premiumStub("AI Image Edit", "AI_IMAGE_API_KEY");
COMMANDS.agnesvideo = premiumStub("AI Talking Video", "AI_VIDEO_API_KEY");
COMMANDS.diffusion = premiumStub("Text-to-Image (Diffusion)", "AI_IMAGE_API_KEY");

// ---------- AI EDITING ----------
COMMANDS.remini = premiumStub("Remini (HD-kan foto)", "REMINI_API_KEY");
COMMANDS.waifu2x = premiumStub("Waifu2X Upscale", "WAIFU2X_API_KEY");
COMMANDS.recolor = premiumStub("Recolor Gambar", "AI_IMAGE_API_KEY");
COMMANDS.imgfilter = premiumStub("Filter Gambar", "AI_IMAGE_API_KEY");
COMMANDS.toreal = premiumStub("Anime ke Real", "AI_IMAGE_API_KEY");
COMMANDS.jadikartun = premiumStub("Foto ke Kartun", "AI_IMAGE_API_KEY");
COMMANDS.removebg = premiumStub("Remove Background", "REMOVEBG_API_KEY");

// ---------- ANIME & MANGA (Jikan API - gratis, tanpa key) ----------
COMMANDS.anime = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .anime Kaguya-sama");
  try {
    const data = await safeFetchJSON(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(ctx.text)}&limit=1`);
    const a = data.data?.[0];
    if (!a) return ctx.reply("Anime nggak ketemu.");
    await ctx.replyImageUrl(
      a.images?.jpg?.image_url,
      `🎬 *${a.title}*\nSkor: ${a.score || "-"}\nEpisode: ${a.episodes || "?"}\nStatus: ${a.status}\n\n${(a.synopsis || "").slice(0, 500)}...`
    );
  } catch {
    await ctx.reply("❌ Gagal ambil data anime, coba lagi nanti.");
  }
};
COMMANDS.waifu = async (ctx) => {
  const query = ctx.text ? `${ctx.text} waifu anime` : "waifu anime aesthetic wallpaper";
  try {
    const results = await searchPinterest(query);
    if (!results.length) return ctx.reply("❌ Tidak menemukan gambar waifu di Pinterest.");
    const pick = results[Math.floor(Math.random() * Math.min(results.length, 15))];
    await ctx.replyImageUrl(pick, `🌸 *Waifu${ctx.text ? ": " + ctx.text : ""}*\n(Sumber: Pinterest)`);
  } catch {
    await ctx.reply("❌ Gagal mengambil gambar waifu dari Pinterest.");
  }
};
COMMANDS.husbu = async (ctx) => {
  const query = ctx.text ? `${ctx.text} husbando anime handsome` : "husbando anime handsome aesthetic";
  try {
    const results = await searchPinterest(query);
    if (!results.length) return ctx.reply("❌ Tidak menemukan gambar husbu di Pinterest.");
    const pick = results[Math.floor(Math.random() * Math.min(results.length, 15))];
    await ctx.replyImageUrl(pick, `🖤 *Husbando${ctx.text ? ": " + ctx.text : ""}*\n(Sumber: Pinterest)`);
  } catch {
    await ctx.reply("❌ Gagal mengambil gambar husbu dari Pinterest.");
  }
};
COMMANDS.pinterest = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .pinterest anime wallpaper aesthetic");
  try {
    const results = await searchPinterest(ctx.text);
    if (!results.length) return ctx.reply(`❌ Tidak menemukan gambar untuk "${ctx.text}" di Pinterest.`);
    const pick = results[Math.floor(Math.random() * Math.min(results.length, 15))];
    await ctx.replyImageUrl(pick, `📌 *Hasil Pinterest: "${ctx.text}"*`);
  } catch {
    await ctx.reply("❌ Gagal mencari di Pinterest.");
  }
};
COMMANDS.pin = COMMANDS.pinterest;
COMMANDS.topanime = async (ctx) => {
  try {
    const data = await safeFetchJSON("https://api.jikan.moe/v4/top/anime?limit=10");
    const list = data.data.map((a, i) => `${i + 1}. ${a.title} (⭐${a.score})`).join("\n");
    await ctx.reply(`🏆 *TOP ANIME*\n${list}`);
  } catch {
    await ctx.reply("❌ Gagal ambil top anime.");
  }
};
COMMANDS.topmale = async (ctx) => {
  try {
    const data = await safeFetchJSON("https://api.jikan.moe/v4/top/characters?limit=10");
    const list = data.data.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
    await ctx.reply(`👤 *TOP KARAKTER* (belum difilter gender, API sumber tidak sediakan field itu)\n${list}`);
  } catch {
    await ctx.reply("❌ Gagal ambil data karakter.");
  }
};
COMMANDS.topfemale = COMMANDS.topmale;
COMMANDS.topsong = staticGuide(
  "Top Anime Song",
  "Rekomendasi manual dulu ya: Gurenge (KnY), Unravel (Tokyo Ghoul), Zankoku na Tenshi no Thesis (Evangelion). Integrasi live list nyusul."
);
COMMANDS.whatanime = async (ctx) => {
  const img = await downloadImage(ctx.msg);
  if (!img) return ctx.reply("Reply screenshot anime dengan caption .whatanime");
  try {
    const form = new FormData();
    form.append("image", new Blob([img]), "frame.jpg");
    const res = await fetch("https://api.trace.moe/search?anilistInfo", { method: "POST", body: form });
    const data = await res.json();
    const best = data.result?.[0];
    if (!best) return ctx.reply("Nggak ketemu kecocokan anime-nya.");
    const title = best.anilist?.title?.romaji || best.filename;
    await ctx.reply(`🔍 Kemungkinan besar: *${title}*\nEpisode: ${best.episode || "?"}\nKemiripan: ${(best.similarity * 100).toFixed(1)}%`);
  } catch {
    await ctx.reply("❌ Gagal cek anime dari gambar.");
  }
};
COMMANDS.ongoing = async (ctx) => {
  try {
    const data = await safeFetchJSON("https://api.jikan.moe/v4/seasons/now?limit=10");
    const list = data.data.map((a, i) => `${i + 1}. ${a.title}`).join("\n");
    await ctx.reply(`📺 *ANIME ONGOING MUSIM INI*\n${list}`);
  } catch {
    await ctx.reply("❌ Gagal ambil daftar ongoing.");
  }
};

// ---------- GAME GUIDE (konten statis - tetep beneran berguna) ----------
COMMANDS.gtguide = staticGuide(
  "Genshin Team Guide",
  "Tim starter yang aman: Main DPS + Sub DPS elemen berbeda + Support Anemo (buat swirl) + Healer/Shield. Contoh: Hu Tao + Xingqiu + Sucrose + Bennett."
);
COMMANDS.hsrguide = staticGuide(
  "Honkai Star Rail Guide",
  "Formasi standar: 1 DPS utama, 1 Sub-DPS/Amplifier, 1 Support (buff/debuff), 1 Sustain (healer/shield). Prioritaskan relic set sesuai jenis DMG karaktermu."
);
COMMANDS.wuwaguide = staticGuide(
  "Wuthering Waves Guide",
  "Fokuskan Resonance Chain karakter utama dulu sebelum sebar ke banyak karakter. Echo dengan set 4-cost yang sesuai elemen biasanya prioritas farming."
);
COMMANDS.genshinguide = staticGuide(
  "Genshin Impact Guide",
  "Naikkan World Level bertahap, selesaikan world quest buat item khusus, dan simpan Primogem buat karakter yang cocok sama tim kamu, bukan asal gacha."
);
COMMANDS.endfieldguide = staticGuide(
  "Arknights: Endfield Guide",
  "Game masih berkembang - pantau update resmi Hypergryph buat mekanik terbaru. Fokus dulu ke pemahaman elemen & positioning tim."
);
COMMANDS.zzzguide = staticGuide(
  "Zenless Zone Zero Guide",
  "Perhatikan tipe serangan musuh (Stun gauge) dan susun tim dengan 1 Attacker, 1 Stun/Anomaly, 1 Support buat kombo Chain Attack maksimal."
);
COMMANDS.baguide = staticGuide(
  "Blue Archive Guide",
  "Bangun tim sesuai Strike/Explosive damage type musuh, dan investasikan Bond level buat naikkan stat pasif karakter favoritmu."
);
COMMANDS.nteguide = staticGuide(
  "Goddess of Victory: Nikke Guide",
  "Susun skuad 5 karakter dengan role Burst 1/2/3 yang sinkron, dan perhatikan cover position buat karakter DPS damage-nya maksimal."
);
COMMANDS.genshinakun = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .genshinakun AR55 5 karakter 5 bintang");
  await ctx.reply(
    `📊 Estimasi kasar akun "${ctx.text}":\nEstimasi ini manual/kasar, bukan appraisal otomatis. Kirim detail AR, jumlah karakter 5★, dan weapon 5★ ke owner buat estimasi lebih akurat.`
  );
};
function randomUsername(style) {
  const prefixes = ["Zafkiel", "Kurumi", "Void", "Nightmare", "Reika", "Shadow", "Astral", "Rein"];
  const suffixes = ["Slayer", "XZ", "Prime", "Chan", "senpai", "ID", "official", "0seven"];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const s = suffixes[Math.floor(Math.random() * suffixes.length)];
  const n = Math.floor(Math.random() * 900) + 100;
  return `${p}${s}${n}`;
}
COMMANDS.usernameml = async (ctx) => {
  const names = Array.from({ length: 5 }, () => randomUsername("ml"));
  await ctx.reply(`🎮 *Nickname ML rekomendasi:*\n${names.join("\n")}`);
};
COMMANDS.usernameff = async (ctx) => {
  const names = Array.from({ length: 5 }, () => `『${randomUsername("ff")}』`);
  await ctx.reply(`🎮 *Nickname FF rekomendasi:*\n${names.join("\n")}`);
};

// ---------- INFORMASI ----------
COMMANDS.jadwalsholat = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .jadwalsholat Jakarta");
  try {
    const cari = await safeFetchJSON(`https://api.myquran.com/v2/sholat/kota/cari/${encodeURIComponent(ctx.text)}`);
    const kota = cari.data?.[0];
    if (!kota) return ctx.reply("Kota tidak ditemukan.");
    const now = new Date();
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, "0"), d = String(now.getDate()).padStart(2, "0");
    const jadwal = await safeFetchJSON(`https://api.myquran.com/v2/sholat/jadwal/${kota.id}/${y}/${m}/${d}`);
    const j = jadwal.data?.jadwal;
    if (!j) return ctx.reply("Jadwal tidak ditemukan.");
    await ctx.reply(
      `🕌 *Jadwal Sholat ${kota.lokasi}*\n${j.tanggal}\n\nSubuh: ${j.subuh}\nDzuhur: ${j.dzuhur}\nAshar: ${j.ashar}\nMaghrib: ${j.maghrib}\nIsya: ${j.isya}`
    );
  } catch {
    await ctx.reply("❌ Gagal ambil jadwal sholat, coba cek nama kota.");
  }
};
COMMANDS.infogempa = async (ctx) => {
  try {
    const data = await safeFetchJSON("https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json");
    const g = data.Infogempa?.gempa;
    if (!g) return ctx.reply("Data gempa tidak tersedia.");
    await ctx.reply(
      `🌍 *Info Gempa Terbaru (BMKG)*\nTanggal: ${g.Tanggal} ${g.Jam}\nMagnitudo: ${g.Magnitude}\nKedalaman: ${g.Kedalaman}\nLokasi: ${g.Wilayah}\nPotensi: ${g.Potensi}`
    );
  } catch {
    await ctx.reply("❌ Gagal ambil data gempa dari BMKG.");
  }
};
COMMANDS.beritabaru = staticGuide(
  "Berita Terbaru",
  "Integrasi RSS berita realtime belum diaktifkan admin. Sementara cek langsung di portal berita favoritmu ya."
);
COMMANDS.infokurs = async (ctx) => {
  try {
    const data = await safeFetchJSON("https://open.er-api.com/v6/latest/USD");
    const idr = data.rates?.IDR;
    await ctx.reply(`💱 *Kurs Hari Ini*\n1 USD = Rp${idr?.toLocaleString("id-ID")}\n(Sumber: open.er-api.com)`);
  } catch {
    await ctx.reply("❌ Gagal ambil data kurs.");
  }
};
COMMANDS.crypto = async (ctx) => {
  try {
    const data = await safeFetchJSON(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,dogecoin&vs_currencies=usd,idr"
    );
    const lines = Object.entries(data).map(
      ([coin, v]) => `${coin}: $${v.usd} / Rp${v.idr?.toLocaleString("id-ID")}`
    );
    await ctx.reply(`📈 *Harga Crypto*\n${lines.join("\n")}`);
  } catch {
    await ctx.reply("❌ Gagal ambil harga crypto.");
  }
};
COMMANDS.cuaca = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .cuaca Bandung");
  try {
    const geo = await safeFetchJSON(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ctx.text)}&count=1`
    );
    const loc = geo.results?.[0];
    if (!loc) return ctx.reply("Kota tidak ditemukan.");
    const w = await safeFetchJSON(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true`
    );
    const c = w.current_weather;
    await ctx.reply(`🌤️ *Cuaca ${loc.name}*\nSuhu: ${c.temperature}°C\nAngin: ${c.windspeed} km/j`);
  } catch {
    await ctx.reply("❌ Gagal ambil data cuaca.");
  }
};

// ---------- SEARCH ----------
COMMANDS.ytsearch = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .ytsearch review anime terbaru");
  try {
    const r = await yts(ctx.text);
    const list = r.videos.slice(0, 5).map((v, i) => `${i + 1}. ${v.title} (${v.timestamp})\n${v.url}`).join("\n\n");
    await ctx.reply(`🔎 *Hasil YouTube: "${ctx.text}"*\n\n${list}`);
  } catch {
    await ctx.reply("❌ Gagal cari di YouTube.");
  }
};
COMMANDS.play = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .play Kimi no Toriko");
  try {
    const r = await yts(ctx.text);
    const v = r.videos[0];
    if (!v) return ctx.reply("Nggak ketemu.");
    await ctx.replyImageUrl(v.thumbnail, `🎵 *${v.title}*\nDurasi: ${v.timestamp}\n${v.url}\n\n(Download audio langsung belum aktif, buka link di atas dulu ya)`);
  } catch {
    await ctx.reply("❌ Gagal cari lagu.");
  }
};
COMMANDS.lens = premiumStub("Reverse Image Search", "GOOGLE_LENS_API_KEY / SERPAPI_KEY");
COMMANDS.carikerja = staticGuide(
  "Cari Kerja",
  "Coba cek langsung: Jobstreet, LinkedIn, Kalibrr, atau Karir.com. Integrasi pencarian otomatis belum diaktifkan admin."
);
COMMANDS.dracin = staticGuide(
  "Cari Drama China",
  "Coba cek di WeTV, iQIYI, atau MyDramaList buat judul & rating drama China terbaru. Integrasi live search belum diaktifkan."
);
COMMANDS.carilagu = COMMANDS.ytsearch;
COMMANDS.shazam = premiumStub("Deteksi Judul Lagu dari Audio", "ACRCLOUD_API_KEY");
COMMANDS.image = async (ctx) => {
  const seed = Math.floor(Math.random() * 1000);
  await ctx.replyImageUrl(`https://picsum.photos/seed/${seed}/700/700`, "🖼️ Gambar random buat kamu~");
};
COMMANDS.quotes = async (ctx) => {
  try {
    const data = await safeFetchJSON("https://zenquotes.io/api/random");
    const q = data[0];
    await ctx.reply(`💬 "${q.q}"\n— ${q.a}`);
  } catch {
    await ctx.reply("❌ Gagal ambil quote.");
  }
};
COMMANDS.fact = async (ctx) => {
  try {
    const data = await safeFetchJSON("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en");
    await ctx.reply(`🧠 Fakta: ${data.text}`);
  } catch {
    await ctx.reply("❌ Gagal ambil fakta.");
  }
};

// ---------- UTILITAS/TOOLS ----------
COMMANDS.menubrat = staticGuide(
  "Menu Brat Style",
  "Pakai .nulis <teks> buat generate gambar teks gaya minimalis (background polos + teks besar, terinspirasi tren 'brat')."
);
COMMANDS.math = COMMANDS.solver;
COMMANDS.nulis = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .nulis Zafkiel");
  const W = 600, H = 600;
  const img = newCanvas(W, H, 0x0f0f0fff);
  const font = await safeFont("SANS_64_WHITE");
  await safePrint(img, font, 20, 220, ctx.text);
  const buffer = await imageToPngBuffer(img);
  await ctx.replyImageBuffer(buffer, "");
};
COMMANDS.lyric = async (ctx) => {
  if (!ctx.text || !ctx.text.includes("-")) return ctx.reply("Contoh: .lyric Ed Sheeran - Perfect");
  const [artist, title] = ctx.text.split("-").map((s) => s.trim());
  try {
    const data = await safeFetchJSON(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
    if (!data.lyrics) return ctx.reply("Lirik nggak ketemu.");
    await ctx.reply(`🎤 *${title} - ${artist}*\n\n${data.lyrics.slice(0, 1500)}`);
  } catch {
    await ctx.reply("❌ Lirik nggak ketemu. Pastikan format: Artis - Judul");
  }
};
COMMANDS.ssweb = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .ssweb https://example.com");
  const url = ctx.text.startsWith("http") ? ctx.text : `https://${ctx.text}`;
  const shot = `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=1000`;
  await ctx.replyImageUrl(shot, `📸 Screenshot dari:\n${url}`);
};
COMMANDS.mememaker = async (ctx) => {
  if (!ctx.text || !ctx.text.includes("|")) return ctx.reply("Contoh: .mememaker teks atas | teks bawah");
  const [top, bottom] = ctx.text.split("|").map((s) => encodeURIComponent(s.trim().replace(/ /g, "_") || "_"));
  const url = `https://api.memegen.link/images/custom/${top}/${bottom}.png?background=https://picsum.photos/seed/${Date.now()}/500`;
  await ctx.replyImageUrl(url, "😂 Meme kamu jadi!");
};
async function googleTTS(text, lang) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
    text.slice(0, 200)
  )}&tl=${lang}&client=tw-ob`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error("TTS gagal");
  return Buffer.from(await res.arrayBuffer());
}
COMMANDS.jpvoice = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .jpvoice こんにちは");
  try {
    const buf = await googleTTS(ctx.text, "ja");
    await ctx.replyAudioBuffer(buf);
  } catch {
    await ctx.reply("❌ Gagal generate suara (layanan TTS mungkin lagi membatasi request).");
  }
};
COMMANDS.googlevoice = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .googlevoice Halo semuanya");
  try {
    const buf = await googleTTS(ctx.text, "id");
    await ctx.replyAudioBuffer(buf);
  } catch {
    await ctx.reply("❌ Gagal generate suara.");
  }
};
COMMANDS.texttospeak = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .texttospeak Halo, apa kabar? |en");
  const [txt, lang] = ctx.text.split("|").map((s) => s.trim());
  try {
    const buf = await googleTTS(txt, lang || "id");
    await ctx.replyAudioBuffer(buf);
  } catch {
    await ctx.reply("❌ Gagal generate suara.");
  }
};
COMMANDS.audiototext = premiumStub("Audio ke Teks (Speech-to-Text)", "SPEECH_API_KEY");
COMMANDS.imagetotext = premiumStub("OCR Gambar ke Teks", "OCR_API_KEY");
async function makeQuoteCard(text, author, colorHex) {
  const W = 700, H = 700;
  const img = newCanvas(W, H, colorHex);
  const font = await safeFont("SANS_32_WHITE");
  const fontSmall = await safeFont("SANS_16_WHITE");
  await safePrint(img, font, 50, 260, `"${text}"`);
  await safePrint(img, fontSmall, 50, 600, `- ${author}`);
  return imageToPngBuffer(img);
}
COMMANDS.quotescard = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .quotescard Waktu adalah senjata terkuat | Kurumi");
  const [text, author] = ctx.text.split("|").map((s) => s.trim());
  const buf = await makeQuoteCard(text, author || "Anonim", 0x28103cff);
  await ctx.replyImageBuffer(buf, "");
};
COMMANDS.iqc = async (ctx) => {
  if (!ctx.text) return ctx.reply("Contoh: .iqc Sesungguhnya bersama kesulitan ada kemudahan | QS. Al-Insyirah 6");
  const [text, author] = ctx.text.split("|").map((s) => s.trim());
  const buf = await makeQuoteCard(text, author || "-", 0x0a2818ff);
  await ctx.replyImageBuffer(buf, "");
};
COMMANDS.translate = async (ctx) => {
  if (!ctx.text || !ctx.text.includes("|")) return ctx.reply("Contoh: .translate Hello world | en|id");
  const parts = ctx.text.split("|");
  const text = parts[0].trim();
  const langpair = (parts[1] || "en|id").trim();
  try {
    const data = await safeFetchJSON(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`
    );
    await ctx.reply(`🌐 ${data.responseData?.translatedText}`);
  } catch {
    await ctx.reply("❌ Gagal translate.");
  }
};
COMMANDS.tomp3 = async (ctx) => {
  await ctx.reply(
    "🎧 Reply video/voice note dengan caption .tomp3 - fitur konversi ke MP3 butuh ffmpeg terpasang di server (lihat README)."
  );
};
COMMANDS.prompter = async (ctx) => {
  const subjects = ["gadis bermata heterochrome", "kota cyberpunk hujan", "kastil melayang", "penari waktu", "gerbang dimensi ungu"];
  const styles = ["digital painting", "anime cel-shaded", "cinematic lighting", "watercolor", "studio ghibli style"];
  const extras = ["ultra detailed", "8k", "dramatic shadow", "soft rim light", "dutch angle"];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const prompt = `${pick(subjects)}, ${pick(styles)}, ${pick(extras)}, ${pick(extras)}`;
  await ctx.reply(`🎨 *Ide Prompt AI Art:*\n${prompt}`);
};

module.exports = { COMMANDS, premiumStub, staticGuide, safeFetchJSON, formatUptime, BOT_START };
