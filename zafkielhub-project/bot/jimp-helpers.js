// ================================
// Helper aman buat Jimp v1 (API-nya beda jauh dari v0.22).
// Semua fungsi di sini dibungkus try/catch supaya kalau ada method yang
// beda di versi jimp tertentu, fitur gambar tetap jalan (fallback), bukan crash.
// ================================
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Jimp, loadFont } = require("jimp");
let fonts = {};
try {
  fonts = require("jimp/fonts");
} catch {
  fonts = {};
}

// Ambil buffer PNG dari instance Jimp, coba beberapa cara biar kompatibel
// lintas versi (getBuffer promise-based baru, atau fallback tulis-ke-file-lalu-baca).
async function imageToPngBuffer(image) {
  if (typeof image.getBuffer === "function") {
    try {
      return await image.getBuffer("image/png");
    } catch {
      /* lanjut ke fallback di bawah */
    }
  }
  const tmpPath = path.join(os.tmpdir(), `zafkielhub-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  await image.write(tmpPath);
  const buffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);
  return buffer;
}

// Load font bitmap bawaan Jimp v1 dengan aman. Kalau nama font nggak ketemu
// atau modul jimp/fonts nggak ada, balikin null (caller wajib skip print teks).
async function safeFont(name) {
  try {
    const key = fonts[name];
    if (!key) return null;
    return await loadFont(key);
  } catch {
    return null;
  }
}

// Print teks dengan aman, fallback ke posisi kiri-atas kalau alignment/opsi lanjutan gagal.
async function safePrint(image, font, x, y, text) {
  if (!font) return;
  try {
    await image.print({ font, x, y, text });
  } catch {
    try {
      image.print(font, x, y, text);
    } catch {
      /* biarin gambar tanpa teks kalau print tetap gagal */
    }
  }
}

function newCanvas(width, height, hexColor) {
  return new Jimp({ width, height, color: hexColor });
}

// Resize dengan aman - coba beberapa bentuk signature karena berubah antar versi jimp.
async function safeResize(image, width, height) {
  try {
    await image.resize({ w: width, h: height });
    return image;
  } catch {}
  try {
    await image.resize({ width, height });
    return image;
  } catch {}
  try {
    image.resize(width, height);
    return image;
  } catch {}
  return image; // kalau semua gagal, biarin ukuran asli daripada crash
}

async function readImage(source) {
  return Jimp.read(source);
}

module.exports = { Jimp, fonts, imageToPngBuffer, safeFont, safePrint, newCanvas, safeResize, readImage };
