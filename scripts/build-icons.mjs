#!/usr/bin/env node
/**
 * 從 public/app-icon-source.{JPG,jpg,png} 烘多尺寸 PNG 給 PWA / iOS / 瀏覽器分頁。
 * 找不到光柵原圖時 fallback 到 icon.svg(舊行為)。
 *
 * 用法:
 *   npm run build:icons
 *   或 node scripts/build-icons.mjs
 *
 * 輸出 public/icons/:
 *   icon-192.png            Android home screen / PWA
 *   icon-512.png            Android splash / PWA
 *   icon-maskable-512.png   Android adaptive(內縮 80% 留 safe-zone)
 *   apple-touch-icon.png    iOS home screen 180×180
 *   favicon-32.png / favicon-16.png   桌機 / 行動瀏覽器分頁
 *
 * 換 icon 流程:
 *   1. 把 1024×1024 原圖丟 public/app-icon-source.{JPG,jpg,png}
 *   2. npm run build:icons
 *   3. git add public/icons/ && git commit
 */

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const publicDir = resolve(repoRoot, 'public');
const iconDir = resolve(publicDir, 'icons');
if (!existsSync(iconDir)) mkdirSync(iconDir, { recursive: true });

// 米紙底色,跟 manifest theme_color 一致(PWA 啟動白屏才不會閃)
const PAPER = { r: 239, g: 230, b: 207, alpha: 1 };

// 來源優先序:光柵原圖(任意大小寫副檔名) > SVG fallback
const sourceCandidates = [
  'app-icon-source.JPG',
  'app-icon-source.jpg',
  'app-icon-source.PNG',
  'app-icon-source.png',
  'icon.svg'
];
let sourcePath = null;
for (const name of sourceCandidates) {
  const p = resolve(publicDir, name);
  if (existsSync(p)) {
    sourcePath = p;
    break;
  }
}
if (!sourcePath) {
  console.error('✗ 找不到 icon 來源,請放任一檔到 public/:');
  console.error('  app-icon-source.JPG / .jpg / .PNG / .png 或 icon.svg');
  process.exit(1);
}
const isSvg = sourcePath.toLowerCase().endsWith('.svg');
const sourceBuf = readFileSync(sourcePath);
console.log(`Source: ${sourcePath} (${isSvg ? 'SVG' : 'raster'})`);
console.log('');

/** SVG 設高 density 才不會糊;光柵原圖直接讀 buf */
function fromSource() {
  return sharp(sourceBuf, isSvg ? { density: 384 } : undefined);
}

const targets = [
  { size: 192, filename: 'icon-192.png', maskable: false },
  { size: 512, filename: 'icon-512.png', maskable: false },
  { size: 512, filename: 'icon-maskable-512.png', maskable: true },
  { size: 180, filename: 'apple-touch-icon.png', maskable: false },
  { size: 32, filename: 'favicon-32.png', maskable: false },
  { size: 16, filename: 'favicon-16.png', maskable: false }
];

for (const { size, filename, maskable } of targets) {
  const out = resolve(iconDir, filename);

  let pipe;
  if (maskable) {
    // Android adaptive icon 會把外框 crop 成圓角/圓/方等形狀,
    // 內容必須在 80% 中心 safe-zone 內。內縮 80% + paper 背景填邊。
    const inner = Math.round(size * 0.8);
    const innerBuf = await fromSource()
      .resize(inner, inner, { fit: 'cover', background: PAPER })
      .png()
      .toBuffer();
    pipe = sharp({
      create: { width: size, height: size, channels: 4, background: PAPER }
    }).composite([{ input: innerBuf, gravity: 'center' }]);
  } else {
    pipe = fromSource().resize(size, size, { fit: 'cover', background: PAPER });
  }

  await pipe.png({ compressionLevel: 9 }).toFile(out);
  console.log(
    `  ✓ public/icons/${filename}  ${size}×${size}${maskable ? '  (maskable safe-zone)' : ''}`
  );
}

console.log('');
console.log('完成。下一步:');
console.log('  git add public/icons/ && git commit -m "rebuild app icons"');
console.log('');
console.log('vite.config.ts manifest icons 已對到 /icons/icon-{192,512}.png,');
console.log('index.html <link rel> 已對到 favicon-{16,32}.png + apple-touch-icon.png,');
console.log('不需再改 config。');
