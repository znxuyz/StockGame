#!/usr/bin/env node
// 從 public/icon.svg 烘出多種尺寸 PNG 給 PWA manifest / iOS apple-touch-icon 用。
// sharp 內建 librsvg,本身就會 rasterize SVG。
//
// 用法:
//   node scripts/build-icons.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const publicDir = resolve(repoRoot, 'public');
const iconDir = resolve(publicDir, 'icons');
if (!existsSync(iconDir)) mkdirSync(iconDir, { recursive: true });

const svg = readFileSync(resolve(publicDir, 'icon.svg'));

// (size, filename, options)
const targets = [
  // Android / PWA standard
  [192, 'icon-192.png', { background: { r: 239, g: 230, b: 207, alpha: 1 } }],
  [512, 'icon-512.png', { background: { r: 239, g: 230, b: 207, alpha: 1 } }],
  // Android maskable(需要安全區內配置主視覺,SVG 已內縮)
  [512, 'icon-maskable-512.png', { background: { r: 239, g: 230, b: 207, alpha: 1 } }],
  // iOS apple-touch-icon
  [180, 'apple-touch-icon.png', { background: { r: 239, g: 230, b: 207, alpha: 1 } }],
  // 16/32 favicon(瀏覽器分頁用,SVG 通常夠但 Safari 偶有問題)
  [32, 'favicon-32.png', { background: { r: 239, g: 230, b: 207, alpha: 1 } }],
  [16, 'favicon-16.png', { background: { r: 239, g: 230, b: 207, alpha: 1 } }],
];

for (const [size, filename, opts] of targets) {
  const out = resolve(iconDir, filename);
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'cover', background: opts.background })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  ✓ public/icons/${filename} (${size}x${size})`);
}

console.log('');
console.log('完成。記得:');
console.log('  - vite.config.ts 的 manifest icons 已指向 /icons/icon-{192,512}.png');
console.log('  - index.html 的 <link rel="apple-touch-icon"> 改成 /icons/apple-touch-icon.png');
