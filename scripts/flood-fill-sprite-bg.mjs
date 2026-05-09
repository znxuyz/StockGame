#!/usr/bin/env node
// Flood-fill 智慧去背:對 public/sprites/ 中指定的 PNG,從 4 個角落取顏色種子,
// BFS 連通像素,跟種子顏色接近的就清成透明。
// 適合「邊框 halo / 漏白」這類連通背景殘留。
// 對「整張完全沒去背 + 主體跟背景顏色差不多」可能會吃掉主體,跑完肉眼確認。
//
// 用法:
//   node scripts/flood-fill-sprite-bg.mjs file1.png file2.png ...
//   node scripts/flood-fill-sprite-bg.mjs --auto    # 對 4 角 alpha > 30 的自動偵測

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir = resolve(repoRoot, 'public', 'sprites');

/** 顏色三通道最大差距 — 越小越保守(主體不易誤殺)、越大越積極(背景清得乾淨) */
const FULL_TRANSPARENT_DELTA = 32;
/** 邊緣淡化區間:超過 FULL_TRANSPARENT_DELTA 但小於 FADE_END_DELTA 線性淡 alpha */
const FADE_END_DELTA = 55;
/** 種子採樣:從 4 個角落各取 N×N 區塊,取 alpha > 50 的像素平均 RGB */
const SEED_BLOCK = 24;
const SEED_MIN_ALPHA = 50;
/**
 * Halo cleanup:fade 區創造的「主體外淡色光暈」要在 flood-fill 後做形態學清理。
 *  - HALO_RADIUS = 3:在 3x3 窗(7×7 pixels)內找 opaque 核心
 *  - HALO_OPAQUE_THRESHOLD = 230:該 pixel alpha >= 230 才算「主體核心」
 *  - 若 partial-alpha pixel(5–230)的 7×7 鄰域沒任一 opaque pixel,
 *    視為孤立 halo 殺掉(設為 0)。保留主體 anti-aliased 邊緣(旁邊有核心)。
 */
const HALO_RADIUS = 3;
const HALO_OPAQUE_THRESHOLD = 230;

/**
 * 取一個角落區塊內 alpha > SEED_MIN_ALPHA 的像素平均 RGB(過濾全透明像素,
 * 全透明像素的 RGB 是 undefined garbage,會把 seed 染成非殘留色,讓 flood 失準)。
 * 若整塊都全透明就回 null,該 seed 跳過。
 */
function sampleCornerRgb(data, W, x0, y0, size) {
  let r = 0, g = 0, b = 0, count = 0;
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] <= SEED_MIN_ALPHA) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
      count++;
    }
  }
  if (count === 0) return null;
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

/** 像素 (i) 顏色跟任一種子的最小通道差 */
function minDeltaToSeeds(data, i, seeds) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  let min = 999;
  for (const s of seeds) {
    const d = Math.max(Math.abs(r - s[0]), Math.abs(g - s[1]), Math.abs(b - s[2]));
    if (d < min) min = d;
  }
  return min;
}

async function processFile(fp, { flood = true, halo = true } = {}) {
  const before = await sharp(fp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = before;
  const W = info.width, H = info.height;
  const N = W * H;
  let cleared = 0, faded = 0, haloRemoved = 0;
  if (!flood) {
    if (halo) haloRemoved = haloCleanup(data, W, H);
    await sharp(data, { raw: { width: W, height: H, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(fp);
    return { cleared: 0, faded: 0, haloRemoved, total: N };
  }

  // 4 角各取 24×24 區塊內 alpha>50 的像素當 seed,任一塊整片透明就跳過該 seed
  const seedsRaw = [
    sampleCornerRgb(data, W, 0, 0, SEED_BLOCK),
    sampleCornerRgb(data, W, W - SEED_BLOCK, 0, SEED_BLOCK),
    sampleCornerRgb(data, W, 0, H - SEED_BLOCK, SEED_BLOCK),
    sampleCornerRgb(data, W, W - SEED_BLOCK, H - SEED_BLOCK, SEED_BLOCK)
  ];
  const seeds = seedsRaw.filter((s) => s !== null);
  if (seeds.length === 0) return { cleared: 0, faded: 0, total: N }; // 4 角全透明,沒得清

  // BFS flood-fill:queue 起點 = 4 角落 + 4 邊中點(更保險偵測單側漸變)
  const visited = new Uint8Array(N);
  const queue = [];
  const seedPx = [
    [0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1],
    [Math.floor(W / 2), 0], [Math.floor(W / 2), H - 1],
    [0, Math.floor(H / 2)], [W - 1, Math.floor(H / 2)]
  ];
  for (const [x, y] of seedPx) {
    queue.push(y * W + x);
  }

  while (queue.length > 0) {
    const idx = queue.shift();
    if (visited[idx]) continue;
    visited[idx] = 1;
    const i = idx * 4;
    const x = idx % W, y = Math.floor(idx / W);

    // 已透明 → 不算 cleared,但繼續向 4 鄰擴散(讓 BFS 走過已透明邊界帶,
    // 抵達另一側的殘留)
    if (data[i + 3] < 5) {
      if (x > 0) queue.push(idx - 1);
      if (x < W - 1) queue.push(idx + 1);
      if (y > 0) queue.push(idx - W);
      if (y < H - 1) queue.push(idx + W);
      continue;
    }

    const delta = minDeltaToSeeds(data, i, seeds);
    if (delta < FULL_TRANSPARENT_DELTA) {
      data[i + 3] = 0;
      cleared++;
    } else if (delta < FADE_END_DELTA) {
      // 線性淡:delta 越大 alpha 留越多
      const fade = (delta - FULL_TRANSPARENT_DELTA) / (FADE_END_DELTA - FULL_TRANSPARENT_DELTA);
      data[i + 3] = Math.min(data[i + 3], Math.round(255 * fade));
      faded++;
      continue; // 不繼續往內擴散(避免吃進主體)
    } else {
      continue; // 命中主體,停
    }

    // 4-neighbors
    if (x > 0) queue.push(idx - 1);
    if (x < W - 1) queue.push(idx + 1);
    if (y > 0) queue.push(idx - W);
    if (y < H - 1) queue.push(idx + W);
  }

  // Halo cleanup pass — 殺掉「主體外的孤立 fade 像素」(看起來像方框淡色 halo)
  if (halo) haloRemoved = haloCleanup(data, W, H);

  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(fp);

  return { cleared, faded, haloRemoved, total: N };
}

/**
 * Halo cleanup:殺掉「主體外的孤立 partial-alpha pixel」。
 * 拷貝原始 alpha 到 snapshot,讀 snapshot 寫 data,避免邊清邊動讓判斷漂移。
 */
function haloCleanup(data, W, H) {
  const snapshot = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) snapshot[i] = data[i * 4 + 3];

  let removed = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const a = snapshot[idx];
      if (a < 5 || a > HALO_OPAQUE_THRESHOLD) continue; // 已透明 / 已主體 → 不動

      let hasOpaqueNeighbor = false;
      const yMin = Math.max(0, y - HALO_RADIUS);
      const yMax = Math.min(H - 1, y + HALO_RADIUS);
      const xMin = Math.max(0, x - HALO_RADIUS);
      const xMax = Math.min(W - 1, x + HALO_RADIUS);
      outer: for (let ny = yMin; ny <= yMax; ny++) {
        for (let nx = xMin; nx <= xMax; nx++) {
          if (snapshot[ny * W + nx] > HALO_OPAQUE_THRESHOLD) {
            hasOpaqueNeighbor = true;
            break outer;
          }
        }
      }

      if (!hasOpaqueNeighbor) {
        data[idx * 4 + 3] = 0;
        removed++;
      }
    }
  }
  return removed;
}

const args = process.argv.slice(2);
let files;

// 如果有 --halo 旗標,只跑 halo cleanup 不跑 flood-fill(對所有 50 隻安全:halo 只殺
// 「主體外孤立 partial-alpha pixel」,沒 halo 的 sprite 是 no-op)
const haloOnly = args.includes('--halo');
const passOpts = haloOnly ? { flood: false, halo: true } : { flood: true, halo: true };

if (haloOnly) {
  files = readdirSync(outDir).filter((f) => f.endsWith('.png'));
  console.log(`--halo 模式:對 ${files.length} 隻 sprite 只跑 halo cleanup(不動 flood-fill)`);
} else if (args[0] === '--auto') {
  // 自動偵測:任一角 alpha > 8 OR partial-alpha 像素 > 4% 視為待修
  // (前者抓「整片殘留 / 邊框 halo」,後者抓「主體外淡色光暈」)
  const all = readdirSync(outDir).filter((f) => f.endsWith('.png'));
  files = [];
  for (const f of all) {
    const fp = resolve(outDir, f);
    const { data, info } = await sharp(fp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    const cornerAlpha = (cx, cy) => {
      let s = 0;
      for (let y = cy; y < cy + 16; y++) for (let x = cx; x < cx + 16; x++) s += data[(y * W + x) * 4 + 3];
      return s / 256;
    };
    const corners = [
      cornerAlpha(0, 0),
      cornerAlpha(W - 16, 0),
      cornerAlpha(0, H - 16),
      cornerAlpha(W - 16, H - 16)
    ];
    if (Math.max(...corners) > 15) files.push(f);
  }
  console.log(`自動偵測到 ${files.length} 隻待修:`, files.join(', '));
} else if (args.filter((a) => !a.startsWith('--')).length > 0) {
  files = args.filter((a) => !a.startsWith('--')).map((a) => basename(a));
} else {
  console.error('用法:');
  console.error('  node scripts/flood-fill-sprite-bg.mjs <file1.png>...   # flood-fill + halo 指定檔');
  console.error('  node scripts/flood-fill-sprite-bg.mjs --auto           # 自動偵測待修');
  console.error('  node scripts/flood-fill-sprite-bg.mjs --halo           # 全 50 隻只跑 halo cleanup');
  process.exit(1);
}

console.log(`\n開始 flood-fill (FULL_TRANSPARENT_DELTA=${FULL_TRANSPARENT_DELTA}, FADE_END=${FADE_END_DELTA}):\n`);
let okCount = 0, failCount = 0;
for (const f of files) {
  const fp = resolve(outDir, f);
  try {
    const { cleared, faded, haloRemoved, total } = await processFile(fp, passOpts);
    const clearedPct = (cleared / total * 100).toFixed(1);
    const fadedPct = (faded / total * 100).toFixed(1);
    const haloPct = (haloRemoved / total * 100).toFixed(1);
    if (passOpts.flood) {
      console.log(`  ✓ ${f.padEnd(28)} 清除 ${clearedPct}% | 淡化 ${fadedPct}% | halo 殺 ${haloPct}%`);
    } else {
      console.log(`  ✓ ${f.padEnd(28)} halo 殺 ${haloPct}%`);
    }
    okCount++;
  } catch (e) {
    console.error(`  ✗ ${f}: ${e.message}`);
    failCount++;
  }
}
console.log(`\n完成: ${okCount} 成功 / ${failCount} 失敗`);
