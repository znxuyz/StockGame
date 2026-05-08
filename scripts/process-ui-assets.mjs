#!/usr/bin/env node
/**
 * 處理 public/assets/ 下的 UI 素材 JPG → 去背 PNG。
 *
 * 用法:
 *   node scripts/process-ui-assets.mjs           # 缺檔才產(增量)
 *   node scripts/process-ui-assets.mjs --force   # 全部重產
 *
 * 處理策略:
 *  - "white"   白底去除 — RGB min 高於閾值 → alpha 0
 *  - "black"   黑底去除 — RGB max 低於閾值 → alpha 0
 *  - "dark"    深色底去除(例如深藍) — brightness 平均低於閾值 → alpha 0
 *  - "white-flood" 中空白底,只去外圈 — 從 4 角開始 BFS,只把連通到角的白變透明
 *
 * 不處理:
 *  - bg/main.JPG    背景圖,JPG 比 PNG 小,維持 .JPG
 *  - particles/spark.JPG   黑底金光,Phaser 用 BlendMode.ADD 直接吃黑,不去背
 */

import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const force = process.argv.includes('--force');

const TASKS = [
  // 按鈕:3 顆白底 + 1 顆深藍底
  { in: 'public/assets/btn/buy.JPG',           out: 'public/assets/btn/buy.png',           mode: 'white' },
  { in: 'public/assets/btn/feed.JPG',          out: 'public/assets/btn/feed.png',          mode: 'white' },
  { in: 'public/assets/btn/sell.JPG',          out: 'public/assets/btn/sell.png',          mode: 'white' },
  { in: 'public/assets/btn/records.JPG',       out: 'public/assets/btn/records.png',       mode: 'dark' },
  // UI:橫幅 + 徽章是黑底,卡片邊框是中空白底
  { in: 'public/assets/ui/top_banner.JPG',     out: 'public/assets/ui/top_banner.png',     mode: 'black' },
  { in: 'public/assets/ui/badge_pet.JPG',      out: 'public/assets/ui/badge_pet.png',      mode: 'black' },
  { in: 'public/assets/ui/frame_card.JPG',     out: 'public/assets/ui/frame_card.png',     mode: 'white-flood' },
  // 粒子:櫻花白底
  { in: 'public/assets/particles/petal.JPG',   out: 'public/assets/particles/petal.png',   mode: 'white' }
];

/** 白底:RGB min ≥ 245 → 透明,215 ~ 245 漸進(跟 sprites pipeline 同閾值) */
function applyWhiteThreshold(data, channels) {
  const ABOVE = 245;
  const BELOW = 215;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const minRgb = Math.min(r, g, b);
    if (minRgb >= ABOVE) data[i + 3] = 0;
    else if (minRgb >= BELOW) {
      const fade = (minRgb - BELOW) / (ABOVE - BELOW);
      data[i + 3] = Math.round(255 * (1 - fade));
    }
  }
}

/** 黑底:RGB max ≤ 30 → 透明,30 ~ 60 漸進 */
function applyBlackThreshold(data, channels) {
  const ABOVE = 60;
  const BELOW = 30;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const maxRgb = Math.max(r, g, b);
    if (maxRgb <= BELOW) data[i + 3] = 0;
    else if (maxRgb <= ABOVE) {
      const fade = (ABOVE - maxRgb) / (ABOVE - BELOW);
      data[i + 3] = Math.round(255 * (1 - fade));
    }
  }
}

/** 深色底:brightness ≤ 70 → 透明,70 ~ 110 漸進。給 records.JPG 深藍底用 */
function applyDarkThreshold(data, channels) {
  const ABOVE = 110;
  const BELOW = 70;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const bright = (r + g + b) / 3;
    if (bright <= BELOW) data[i + 3] = 0;
    else if (bright <= ABOVE) {
      const fade = (ABOVE - bright) / (ABOVE - BELOW);
      data[i + 3] = Math.round(255 * (1 - fade));
    }
  }
}

/**
 * Flood fill 白底(只切外圈,內部裝飾保留)。
 *  - 從 4 角開始 BFS
 *  - 像素 RGB min ≥ FLOOD_THRESHOLD 視為白背景,標記為透明
 *  - 用 typed Uint8Array 當 visited mark
 */
function applyWhiteFloodFill(data, width, height, channels) {
  const FLOOD_THRESHOLD = 230;
  const visited = new Uint8Array(width * height);
  const queue = [];
  // 4 角入隊
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1]
  ];
  for (const [x, y] of corners) queue.push(y * width + x);

  while (queue.length > 0) {
    const idx = queue.shift();
    if (visited[idx]) continue;
    visited[idx] = 1;
    const x = idx % width;
    const y = (idx - x) / width;
    const dataIdx = idx * channels;
    const r = data[dataIdx];
    const g = data[dataIdx + 1];
    const b = data[dataIdx + 2];
    const minRgb = Math.min(r, g, b);
    if (minRgb < FLOOD_THRESHOLD) continue;
    data[dataIdx + 3] = 0;
    if (x > 0) queue.push(idx - 1);
    if (x < width - 1) queue.push(idx + 1);
    if (y > 0) queue.push(idx - width);
    if (y < height - 1) queue.push(idx + width);
  }
}

async function processOne(task) {
  const inPath = resolve(repoRoot, task.in);
  const outPath = resolve(repoRoot, task.out);

  if (!existsSync(inPath)) {
    console.warn(`  ⚠ 跳過(原檔不存在):${task.in}`);
    return { skipped: true };
  }

  if (!force && existsSync(outPath)) {
    const inMtime = statSync(inPath).mtimeMs;
    const outMtime = statSync(outPath).mtimeMs;
    if (outMtime >= inMtime) {
      console.log(`  ⊙ 已存在(略過):${task.out}`);
      return { skipped: true };
    }
  }

  const { data, info } = await sharp(inPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;

  switch (task.mode) {
    case 'white':
      applyWhiteThreshold(data, channels);
      break;
    case 'black':
      applyBlackThreshold(data, channels);
      break;
    case 'dark':
      applyDarkThreshold(data, channels);
      break;
    case 'white-flood':
      applyWhiteFloodFill(data, width, height, channels);
      break;
    default:
      throw new Error(`未知 mode: ${task.mode}`);
  }

  await sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log(`  ✓ ${task.in} → ${task.out} (${task.mode}, ${width}×${height})`);
  return { ok: true };
}

console.log('[process-ui-assets] 處理 UI 素材 JPG → 去背 PNG');
console.log(`  共 ${TASKS.length} 個目標,${force ? '全部重產' : '增量(較新者跳過)'}`);
console.log('');

let okCount = 0;
let skipCount = 0;
for (const task of TASKS) {
  const r = await processOne(task);
  if (r.ok) okCount++;
  else if (r.skipped) skipCount++;
}

console.log('');
console.log(`[process-ui-assets] 完成:${okCount} 個產出,${skipCount} 個跳過`);
console.log('');
console.log('  下一步:用 git diff / 開圖檢查每張去背效果');
console.log('  - 白底邊緣不夠乾淨 → 調 ABOVE/BELOW 閾值');
console.log('  - 內部裝飾被吃掉 → frame_card 用 white-flood,其他改 white-flood');
