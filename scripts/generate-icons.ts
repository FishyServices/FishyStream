/**
 * generate-icons.ts
 * Converts public/logo.svg into all required app icons.
 *
 * Usage:  bun scripts/generate-icons.ts
 */

import sharp from "sharp";

const root = import.meta.dir + "/..";

const svgBuffer = await Bun.file(`${root}/public/logo.svg`).bytes();

interface IconDef {
  out: string;
  size: number;
  padding?: number;
  bg?: string;
}

const icons: IconDef[] = [
  { out: "public/icons/pwa-512x512.png", size: 512 },
  { out: "public/icons/pwa-192x192.png", size: 192 },

  { out: "public/icons/maskable-512x512.png", size: 512, padding: 52 },

  // apple
  { out: "public/icons/apple-touch-icon.png", size: 180, bg: "#0a0a12" },

  // fav
  { out: "public/favicon-32x32.png", size: 32 },
  { out: "public/favicon-16x16.png", size: 16 },

  // general / android
  { out: "public/icons/icon-256x256.png", size: 256 },
  { out: "public/icons/icon-128x128.png", size: 128 },
  { out: "public/icons/icon-64x64.png", size: 64 }
];

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    alpha: 1 as const
  };
}

async function generateIcon({ out, size, padding = 0, bg }: IconDef) {
  const outPath = `${root}/${out}`;

  await Bun.write(outPath, "");

  const innerSize = size - padding * 2;

  if (bg && padding === 0) {
    const svgPng = await sharp(svgBuffer).resize(size, size).png().toBuffer();
    const png = await sharp({
      create: { width: size, height: size, channels: 3, background: hexToRgb(bg) }
    })
      .composite([{ input: svgPng }])
      .png()
      .toBuffer();
    await Bun.write(outPath, png);
  } else if (padding > 0 || bg) {
    const svgPng = await sharp(svgBuffer).resize(innerSize, innerSize).png().toBuffer();
    const png = await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: bg ? hexToRgb(bg) : { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: svgPng, gravity: "center" }])
      .png()
      .toBuffer();
    await Bun.write(outPath, png);
  } else {
    const png = await sharp(svgBuffer).resize(size, size).png().toBuffer();
    await Bun.write(outPath, png);
  }

  console.log(`${out}  (${size}×${size})`);
}

console.log("Generating icons from public/logo.svg …\n");

for (const icon of icons) {
  await generateIcon(icon);
}

console.log("\nDone.");
