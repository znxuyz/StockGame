#!/usr/bin/env node
/**
 * 修 records.png 4 角白色 halo:
 *  - 偵測:該 PNG 4 角 alpha=255 純白(255,255,255),其他 PNG (buy/feed/sell)
 *    4 角 alpha=0,顯然這張的 alpha mask 有 bug
 *  - 解法:從 4 角 flood-fill,把所有「(R,G,B 都 > 235 且色差 < 12)且 alpha=255」
 *    的連通像素改成 alpha=0
 *  - 米色卷軸主體 (R=243, G=218, B=170) 色差 73,不會誤刪
 *
 * 用法:
 *   node scripts/fix-records-alpha.mjs
 *
 * 跑完 commit public/assets/btn/records.png。
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const target = resolve(repoRoot, 'public/assets/btn/records.png');

const { data, info } = await sharp(target).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const C = info.channels;
if (C !== 4) {
  console.error('PNG 沒有 alpha channel,中止');
  process.exit(1);
}

/** 判斷是否為近白(角落 halo 特徵):RGB 都 >= 235、色差 < 12(灰白色,非彩色) */
function isNearWhiteHalo(r, g, b) {
  if (r < 235 || g < 235 || b < 235) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min < 12;
}

/** flood-fill 從 4 角往內,把連通的「alpha=255 + 近白」像素改 alpha=0 */
const visited = new Uint8Array(W * H);
const stack = [
  [0, 0],
  [W - 1, 0],
  [0, H - 1],
  [W - 1, H - 1]
];
let changed = 0;

while (stack.length > 0) {
  const [x, y] = stack.pop();
  if (x < 0 || x >= W || y < 0 || y >= H) continue;
  const idx = y * W + x;
  if (visited[idx]) continue;
  visited[idx] = 1;

  const off = idx * 4;
  const a = data[off + 3];
  if (a === 0) continue; // 已透明,不處理但仍向外推(等等等等,不推,讓 visited 擋下;不向外推)
  const r = data[off];
  const g = data[off + 1];
  const b = data[off + 2];
  if (!isNearWhiteHalo(r, g, b)) continue;

  // 命中:設 alpha 0
  data[off + 3] = 0;
  changed++;

  // 把 4 鄰居推進 stack
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

await sharp(data, { raw: { width: W, height: H, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(target);

console.log(`✓ ${target}`);
console.log(`  改了 ${changed} 個近白 halo 像素 → alpha 0`);
