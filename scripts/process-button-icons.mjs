#!/usr/bin/env node
/**
 * 處理新上傳的 button / tab icon(MJ 1024×1024 原圖)→ 去背 + 縮小。
 *
 * v2:從 4 角採樣 seed RGB 動態做 flood-fill,因為 MJ 輸出有時白底有時黑底,
 * 不能 hardcode「白色 = 背景」(v1 只清掉白底的 3 張,黑底的 7 張完全沒清)。
 * 邏輯抄自 scripts/flood-fill-sprite-bg.mjs(立繪去背)+ process-rings.mjs。
 *
 * 跟 process-ui-assets.mjs 不同:
 *   - 輸入已是 PNG(不是 JPG)
 *   - 輸出 in-place(覆蓋原檔)
 *   - 一次性 script,跑完就不需要再跑;結果 commit 進 repo
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const ICONS = [
  // BottomBar 新功能(舊的 records / settings 不重跑,已 256×256 去背完成)
  'public/assets/btn/game.png',
  'public/assets/btn/friends.png',
  'public/assets/btn/trade.png',
  // tab icons(GameModal + RecordsModal 用)
  'public/assets/btn/tab/task.png',
  'public/assets/btn/tab/achievement.png',
  'public/assets/btn/tab/codex.png',
  'public/assets/btn/tab/cultivation.png',
  'public/assets/btn/tab/chart.png',
  'public/assets/btn/tab/compare.png',
  'public/assets/btn/tab/transactions.png'
];

const TARGET_SIZE = 256;
const SEED_BLOCK = 16;
const FULL_TRANSPARENT_DELTA = 40; // 差距 < 40 → alpha 0
const FADE_END_DELTA = 70; // 差距 40-70 → 線性淡 alpha,>70 完全保留

function sampleCornerRgb(data, W, x0, y0, size) {
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) {
      const i = (y * W + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function minDeltaToSeeds(data, i, seeds) {
  const r = data[i],
    g = data[i + 1],
    b = data[i + 2];
  let min = 999;
  for (const s of seeds) {
    const d = Math.max(Math.abs(r - s[0]), Math.abs(g - s[1]), Math.abs(b - s[2]));
    if (d < min) min = d;
  }
  return min;
}

function floodFillToTransparent(data, W, H) {
  // 4 角 seed
  const seeds = [
    sampleCornerRgb(data, W, 0, 0, SEED_BLOCK),
    sampleCornerRgb(data, W, W - SEED_BLOCK, 0, SEED_BLOCK),
    sampleCornerRgb(data, W, 0, H - SEED_BLOCK, SEED_BLOCK),
    sampleCornerRgb(data, W, W - SEED_BLOCK, H - SEED_BLOCK, SEED_BLOCK)
  ];

  const visited = new Uint8Array(W * H);
  const queue = [];
  // 4 角 + 4 邊中點當起點(更穩)
  const seedPx = [
    [0, 0],
    [W - 1, 0],
    [0, H - 1],
    [W - 1, H - 1],
    [(W / 2) | 0, 0],
    [(W / 2) | 0, H - 1],
    [0, (H / 2) | 0],
    [W - 1, (H / 2) | 0]
  ];
  for (const [x, y] of seedPx) queue.push(y * W + x);

  let cleared = 0;
  let faded = 0;
  while (queue.length > 0) {
    const idx = queue.shift();
    if (visited[idx]) continue;
    visited[idx] = 1;
    const i = idx * 4;
    // 已透明(之前處理過或原本就透明)→ 不擴散到鄰居(保護內部已被去背的孔洞)
    if (data[i + 3] < 5) continue;
    const delta = minDeltaToSeeds(data, i, seeds);
    if (delta < FULL_TRANSPARENT_DELTA) {
      data[i + 3] = 0;
      cleared++;
    } else if (delta < FADE_END_DELTA) {
      const fade =
        (delta - FULL_TRANSPARENT_DELTA) / (FADE_END_DELTA - FULL_TRANSPARENT_DELTA);
      data[i + 3] = Math.min(data[i + 3], Math.round(255 * fade));
      faded++;
      continue; // 不繼續擴散(避免吃進主體)
    } else {
      continue;
    }
    const x = idx % W;
    const y = (idx - x) / W;
    if (x > 0) queue.push(idx - 1);
    if (x < W - 1) queue.push(idx + 1);
    if (y > 0) queue.push(idx - W);
    if (y < H - 1) queue.push(idx + W);
  }
  return { cleared, faded, seeds };
}

console.log(`處理 ${ICONS.length} 個 icon → 4 角 seed flood-fill + 縮小 ${TARGET_SIZE}×${TARGET_SIZE}\n`);
let totalIn = 0;
let totalOut = 0;

for (const rel of ICONS) {
  const fp = resolve(repoRoot, rel);
  const inSize = statSync(fp).size;
  totalIn += inSize;

  // 先 resize 再 flood-fill(資料量小一個量級)
  const { data, info } = await sharp(fp)
    .resize(TARGET_SIZE, TARGET_SIZE, { kernel: 'lanczos3', fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { cleared, faded, seeds } = floodFillToTransparent(data, info.width, info.height);

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(fp);

  const outSize = statSync(fp).size;
  totalOut += outSize;
  const N = info.width * info.height;
  const cPct = ((cleared / N) * 100).toFixed(1);
  const fPct = ((faded / N) * 100).toFixed(1);
  const seedStr = seeds[0].join(',');
  console.log(
    `  ✓ ${rel.padEnd(45)} ${(inSize / 1024).toFixed(0).padStart(5)}KB → ${(outSize / 1024).toFixed(1).padStart(6)}KB  clr ${cPct.padStart(5)}%  fade ${fPct.padStart(4)}%  seed [${seedStr}]`
  );
}

console.log(`\n總計 ${(totalIn / 1024 / 1024).toFixed(2)}MB → ${(totalOut / 1024).toFixed(0)}KB`);
