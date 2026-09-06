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

async function imageToPngBuffer(image) {
  if (typeof image.getBuffer === "function") {
    try {
      return await image.getBuffer("image/png");
    } catch {}
  }
  const tmpPath = path.join(
    os.tmpdir(),
    `zafkielhub-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
  );
  await image.write(tmpPath);
  const buffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);
  return buffer;
}

async function safeFont(name) {
  try {
    const key = fonts[name];
    if (!key) return null;
    return await loadFont(key);
  } catch {
    return null;
  }
}

async function safePrint(image, font, x, y, text) {
  if (!font) return;
  try {
    await image.print({ font, x, y, text });
  } catch {
    try {
      image.print(font, x, y, text);
    } catch {}
  }
}

function newCanvas(width, height, hexColor) {
  return new Jimp({ width, height, color: hexColor });
}

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
  return image;
}

async function readImage(source) {
  return Jimp.read(source);
}

module.exports = {
  Jimp,
  fonts,
  imageToPngBuffer,
  safeFont,
  safePrint,
  newCanvas,
  safeResize,
  readImage,
};
