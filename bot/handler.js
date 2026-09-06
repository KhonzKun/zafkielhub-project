const { Sticker, StickerTypes } = require("wa-sticker-formatter");
const store = require("./store");
const { COMMANDS } = require("./commands");
const {
  buildMenuCaption,
  buildMenuBanner,
  findCommandMeta,
} = require("./menu");
const { imageToPngBuffer, readImage } = require("./jimp-helpers");
const {
  extractText,
  parsePrefixCommand,
  downloadImage,
  downloadVideo,
  getQuoted,
  jidToNumber,
} = require("./utils");

function attachCommandHandler(sock, logActivity) {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message) return;

    const jid = msg.key.remoteJid;

    const isGroup = jid.endsWith("@g.us");
    const sender = isGroup ? msg.key.participant : jid;
    const pushName = msg.pushName || "Member";

    const text = extractText(msg);
    const botSettings = store.getBotSettings();
    const parsed = parsePrefixCommand(text, botSettings.prefixes);

    logActivity(
      `Pesan masuk dari ${jidToNumber(sender)}${parsed ? ` (command: ${parsed.cmd})` : ""}`,
    );

    if (!parsed) return;

    const member = store.getMember(sender, pushName);
    const level = store.levelFromExp(member.exp);

    if (parsed.cmd === "menu" || parsed.cmd === "help") {
      try {
        const banner = await buildMenuBanner(botSettings);
        const caption = buildMenuCaption(botSettings, { ...member, level });
        await sock.sendMessage(
          jid,
          { image: banner, caption },
          { quoted: msg },
        );
        store.addExpCoin(sender, 1, 0);
      } catch (err) {
        logActivity(`Gagal kirim menu: ${err.message}`);
        await sock.sendMessage(
          jid,
          { text: "[-] Gagal membuat menu, silakan coba lagi." },
          { quoted: msg },
        );
      }
      return;
    }

    const handler = COMMANDS[parsed.cmd];
    if (!handler) return;

    const meta = findCommandMeta(parsed.cmd);
    if (meta && !member.premium && member.limit <= 0) {
      await sock.sendMessage(
        jid,
        {
          text: "[!] Limit kamu habis. Ketik .claim untuk klaim harian atau .buycredit untuk tambah limit.",
        },
        { quoted: msg },
      );
      return;
    }

    const ctx = {
      sock,
      msg,
      jid,
      sender,
      isGroup,
      args: parsed.args,
      text: parsed.text,
      member: { ...member, level },
      botSettings,
      isOwner: jidToNumber(sender) === botSettings.ownerNumber,

      reply: (text) => sock.sendMessage(jid, { text }, { quoted: msg }),

      replyImageUrl: async (url, caption) => {
        if (!url)
          return sock.sendMessage(
            jid,
            { text: caption || "Gagal ambil gambar." },
            { quoted: msg },
          );
        await sock.sendMessage(
          jid,
          { image: { url }, caption: caption || "" },
          { quoted: msg },
        );
      },

      replyImageBuffer: async (buffer, caption) => {
        await sock.sendMessage(
          jid,
          { image: buffer, caption: caption || "" },
          { quoted: msg },
        );
      },

      replyAudioBuffer: async (buffer) => {
        await sock.sendMessage(
          jid,
          { audio: buffer, mimetype: "audio/mpeg", ptt: false },
          { quoted: msg },
        );
      },

      replyStickerFromBuffer: async (buffer) => {
        await sock.sendMessage(jid, { sticker: buffer }, { quoted: msg });
      },

      makeSticker: async () => {
        const image = await downloadImage(msg);
        const video = !image ? await downloadVideo(msg) : null;
        const buf = image || video;
        if (!buf)
          return sock.sendMessage(
            jid,
            { text: "Gagal ambil media." },
            { quoted: msg },
          );
        const sticker = new Sticker(buf, {
          pack: botSettings.botName,
          author: botSettings.ownerName,
          type: StickerTypes.FULL,
          quality: 70,
        });
        const buffer = await sticker.toBuffer();
        await sock.sendMessage(jid, { sticker: buffer }, { quoted: msg });
      },

      stickerToImage: async () => {
        const quoted = getQuoted(msg);
        const stickerMsg =
          msg.message?.stickerMessage || quoted?.message?.stickerMessage;
        const target = msg.message?.stickerMessage ? msg : quoted;
        const { downloadMediaMessage } = require("@whiskeysockets/baileys");
        const buf = await downloadMediaMessage(target, "buffer", {});
        const img = await readImage(buf);
        const out = await imageToPngBuffer(img);
        await sock.sendMessage(
          jid,
          { image: out, caption: "" },
          { quoted: msg },
        );
      },
    };

    try {
      store.consumeLimit(sender, meta ? 1 : 0);
      await handler(ctx);
      store.addExpCoin(sender, botSettings.expPerCommand, 0);
      store.updateMember(sender, { lastCommandAt: new Date().toISOString() });
    } catch (err) {
      logActivity(`Error command ${parsed.cmd}: ${err.message}`);
      await sock.sendMessage(
        jid,
        { text: `[-] Terjadi error saat menjalankan .${parsed.cmd}` },
        { quoted: msg },
      );
    }
  });
}

module.exports = { attachCommandHandler };
