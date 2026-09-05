const { downloadMediaMessage } = require("@whiskeysockets/baileys");

function extractText(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ""
  ).trim();
}

// Ambil pesan yang di-reply (kalau ada)
function getQuoted(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx || !ctx.quotedMessage) return null;
  return {
    message: ctx.quotedMessage,
    key: {
      remoteJid: msg.key.remoteJid,
      id: ctx.stanzaId,
      participant: ctx.participant,
    },
  };
}

function messageHasImage(msg) {
  return !!(msg.message?.imageMessage || getQuoted(msg)?.message?.imageMessage);
}

function messageHasVideo(msg) {
  return !!(msg.message?.videoMessage || getQuoted(msg)?.message?.videoMessage);
}

async function downloadImage(msg) {
  const target = msg.message?.imageMessage ? msg : getQuoted(msg);
  if (!target || !target.message?.imageMessage) return null;
  return downloadMediaMessage(target, "buffer", {});
}

async function downloadVideo(msg) {
  const target = msg.message?.videoMessage ? msg : getQuoted(msg);
  if (!target || !target.message?.videoMessage) return null;
  return downloadMediaMessage(target, "buffer", {});
}

function parsePrefixCommand(text, prefixes) {
  if (!text) return null;
  const usedPrefix = prefixes.find((p) => text.startsWith(p));
  if (!usedPrefix) return null;
  const withoutPrefix = text.slice(usedPrefix.length).trim();
  if (!withoutPrefix) return null;
  const [cmd, ...rest] = withoutPrefix.split(/\s+/);
  return {
    cmd: cmd.toLowerCase(),
    args: rest,
    text: rest.join(" "),
  };
}

function jidToNumber(jid = "") {
  return jid.split("@")[0].split(":")[0];
}

// Cari gambar dari Pinterest (tanpa API key)
async function searchPinterest(query) {
  try {
    const q = `${query} site:pinterest.com`;
    const tokenRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(q)}&t=h_&iar=images&iax=images&ia=images`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
      }
    );
    const html = await tokenRes.text();
    const vqdMatch = html.match(/vqd=([0-9-]+)/) || html.match(/vqd=["']([0-9-]+)["']/);
    if (vqdMatch) {
      const vqd = vqdMatch[1];
      const imgRes = await fetch(
        `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Referer: "https://duckduckgo.com/",
          },
        }
      );
      const data = await imgRes.json();
      if (data.results && data.results.length > 0) {
        const urls = data.results.map((r) => r.image).filter(Boolean);
        if (urls.length > 0) return urls;
      }
    }
  } catch {
    // Fallback di bawah
  }

  // Fallback cadangan kalau query Pinterest kosong
  try {
    const isHusbu = query.toLowerCase().includes("husbu") || query.toLowerCase().includes("male");
    if (isHusbu) {
      const res = await fetch("https://nekos.best/api/v2/husbando?amount=5");
      const data = await res.json();
      return data.results?.map((r) => r.url) || [];
    } else {
      const res = await fetch("https://api.waifu.pics/sfw/waifu");
      const data = await res.json();
      return [data.url];
    }
  } catch {
    return [];
  }
}

module.exports = {
  extractText,
  getQuoted,
  messageHasImage,
  messageHasVideo,
  downloadImage,
  downloadVideo,
  parsePrefixCommand,
  jidToNumber,
  searchPinterest,
};
